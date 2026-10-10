import fs from 'node:fs'
import path from 'node:path'
import {
  devices,
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from '@playwright/test'
import type { DebugRoom, DebugSeat } from '~~/lib/debug-rooms'
import type { GameProbe, PlaytestScope } from '~~/lib/playtest-probe'
import { randomBetween, randomInt, sample } from '~~/lib/arrays'
import { viewLogViolations } from './view-log'

/**
 * The playtest client as a spec checker: real browser seats play whole games
 * beside server bots, and every tick compares what each page RENDERED (its
 * `seat-rendered` acks, as the server holds them) against the server's own
 * cursor, runs the shared seat invariants over the live room — armed timers
 * included — through `/debug/rooms`, and greps the server log for the
 * auditor's `seat-audit`, `seat-illegal` and `seat-unsent` lines. A
 * spectator page rides along; its booth acks must never touch a racer's audit.
 *
 * Runs under playwright.playtest.config.ts. Knobs: PLAYTEST_ROOMS (parallel
 * rooms), PLAYTEST_SEATS (browser seats per room), PLAYTEST_BOTS,
 * PLAYTEST_MINUTES (per-game budget), PLAYTEST_LENGTH (short|medium|long),
 * PLAYTEST_DEVICE (a Playwright device name, e.g. "iPhone 14"), PLAYTEST_CHAOS=1
 * (seats drop offline at random), PLAYTEST_BROWSER=webkit (in the config),
 * PLAYTEST_SPECTATOR=0 (no booth page), PLAYTEST_REQUIRE_VICTORY=0 (a budget
 * shorter than a game), PLAYTEST_SHOTS=1 (a screenshot of every
 * view once it settles), PLAYTEST_BASE_URL + PLAYTEST_DEBUG_TOKEN (a running
 * server), PLAYTEST_SERVER_LOG (that server's stdout, when reachable).
 */

const ROOMS = Number(process.env.PLAYTEST_ROOMS ?? 1)
const SEATS = Number(process.env.PLAYTEST_SEATS ?? 2)
const BOTS = Number(process.env.PLAYTEST_BOTS ?? 2)
const GAME_BUDGET_MS = Number(process.env.PLAYTEST_MINUTES ?? 40) * 60_000
const LENGTH = process.env.PLAYTEST_LENGTH ?? 'short'
const SERVER_LOG = process.env.PLAYTEST_SERVER_LOG
const DEBUG_TOKEN = process.env.PLAYTEST_DEBUG_TOKEN
const DEVICE = process.env.PLAYTEST_DEVICE
const CHAOS = process.env.PLAYTEST_CHAOS === '1'
const SPECTATOR = process.env.PLAYTEST_SPECTATOR !== '0'
const REQUIRE_VICTORY = process.env.PLAYTEST_REQUIRE_VICTORY !== '0'
const OUT_DIR = path.resolve(process.env.PLAYTEST_OUT ?? 'test-results/playtest')

/** A stable server cursor the seat's own page has not rendered within this. */
const RENDER_LAG_MS = 3000
const TRANSITION_STUCK_MS = 4000
const DISCONNECT_MS = 15_000
const LONG_TASK_MS = 2500
const HEAL_WINDOW_MS = 30_000
/** How long a lagging seat gets to recover on its own before it counts as frozen. */
const SELF_HEAL_MS = 30_000
const TICK_MS = 1000
const PROBE_GAP_MS = 6000
/** Chaos mode: per tick, the chance a seat drops offline, and for how long. */
const CHAOS_ODDS = 1 / 90
const CHAOS_OFFLINE_MS: [number, number] = [2000, 8000]
/** After a chaos outage, how long the seat gets to resync before lag counts. */
const RECONNECT_WINDOW_MS = 15_000
const TICK_TIMEOUT_MS = 15_000
/** Longer than any incident's recovery watch plus reload: past it a tick is hung. */
const TICK_HANG_MS = 120_000
const SHOTS = process.env.PLAYTEST_SHOTS === '1'
const VIEW_SETTLE_MS = 3000
/** Kinds reported as evidence: no page recovery watch, no reload — the
 *  server-side findings among them still fail the run. */
const EVIDENCE_ONLY = new Set(['long-task', 'page-error', 'invariant', 'subject-loop'])
/** Kinds that never fail the run on their own. */
const NON_VERDICT = new Set(['long-task'])
const SERVER_LINE = /\b(seat-audit|seat-illegal|seat-unsent)\b/

const ACK_BUTTON =
  /^(let's go|continue|close scores|ready|i'm ready|pencils up|chain me in|link me in|weigh in|submit ranking|set the record|lock in.*|submit.*|play the clip)$/i
const GUESSES = ['France', 'Brazil', 'Japan', 'Kenya', 'Canada', 'India', 'Egypt', 'Peru']
const MAP_CODES = ['FR', 'DE', 'BR', 'JP', 'US', 'IN', 'EG', 'AU', 'CN', 'MX', 'NG', 'AR']

interface Incident {
  kind: string
  seat: string
  at: string
  detail: string
  selfHealedMs?: number
  healedByRefresh?: boolean
  healMs?: number
  probe?: GameProbe
  server?: DebugSeat[]
}

interface Seat {
  name: string
  page: Page
  history: GameProbe[]
  open: Set<string>
  longTasksSeen: number
  errors: string[]
  console: string[]
  ticking?: number
  tickHangReported?: boolean
  /** Until when chaos holds this seat offline (plus its resync window). */
  quietUntil: number
  shots: number
  lastView?: string
}

/** Per seat id: the server's (step, subject) and when this run first saw it. */
interface CursorWatch {
  key: string
  since: number
  subjects: string[]
}

const readProbe = (page: Page) =>
  page.evaluate(() => (window as unknown as PlaytestScope).__gameProbe?.()).catch(() => undefined)

const readLongTasks = (page: Page) =>
  page
    .evaluate(() => (window as unknown as PlaytestScope).__longTasks ?? [])
    .catch(() => [] as { at: number; duration: number }[])

const readViewLog = (page: Page) =>
  page.evaluate(() => (window as unknown as PlaytestScope).__viewLog ?? []).catch(() => [])

const withViewLog = (url: string) => `${url}${url.includes('?') ? '&' : '?'}viewlog=1`

/** The room as the owning machine sees it, and when this run read it. */
type RoomRead = DebugRoom & { readAt: number }

const readRoom = async (
  request: APIRequestContext,
  gameId: string
): Promise<RoomRead | undefined> => {
  const response = await request
    .get(`/debug/rooms/${gameId}`, { headers: { authorization: `Bearer ${DEBUG_TOKEN}` } })
    .catch(() => undefined)
  return response?.ok()
    ? { ...((await response.json()) as DebugRoom), readAt: Date.now() }
    : undefined
}

const cursorKey = (cursor: { step: string; subject: string } | undefined) =>
  cursor ? `${cursor.step} ${cursor.subject}` : 'none'

/** One cheap move per tick: press whatever ack is up, otherwise try an answer.
 *  Rounds the actor can't play fall to the bots and the server caps. */
const act = async (page: Page) => {
  const quick = { timeout: 800 }
  try {
    const acks = page.getByRole('button', { name: ACK_BUTTON })
    for (const button of (await acks.all()).slice(0, 3)) {
      if ((await button.isVisible()) && (await button.isEnabled())) {
        await button.click(quick)
        return
      }
    }
    const intro = page.locator('.gauntlet-intro')
    if (await intro.isVisible()) return void (await intro.click(quick))

    const options = page.locator('.card-option:not([disabled]):visible')
    const optionCount = await options.count()
    if (optionCount) return void (await options.nth(randomInt(0, optionCount - 1)).click(quick))

    const input = page.locator('.guess-form input:visible').first()
    if ((await input.count()) && (await input.isEnabled())) {
      await input.fill(sample(GUESSES)!, quick)
      await input.press('Enter', quick)
      return
    }

    await page.evaluate(
      isoCode => document.dispatchEvent(new CustomEvent('mapClick', { detail: { isoCode } })),
      sample(MAP_CODES)!
    )
  } catch {
    // A view swapped under the click — the next tick reads the new one.
  }
}

/** The server log lines about this game since the last read. */
const serverLines = (gameId: string, from: number) => {
  if (!SERVER_LOG || !fs.existsSync(SERVER_LOG)) return { lines: [] as string[], to: from }
  const text = fs.readFileSync(SERVER_LOG, 'utf8')
  const lines = text
    .slice(from)
    .split('\n')
    .filter(line => line.includes(gameId))
  return { lines, to: text.length }
}

const openPage = async (browser: Browser) => {
  const context = await browser.newContext(
    DEVICE ? devices[DEVICE] : { viewport: { width: 1280, height: 800 } }
  )
  return context.newPage()
}

const openSeat = async (browser: Browser, name: string, url?: string): Promise<Seat> => {
  const page = await openPage(browser)
  const seat: Seat = {
    name,
    page,
    history: [],
    open: new Set(),
    longTasksSeen: 0,
    errors: [],
    console: [],
    quietUntil: 0,
    shots: 0,
  }
  page.on('console', message => {
    seat.console.push(`${new Date().toISOString()} ${message.type()} ${message.text()}`)
    if (seat.console.length > 500) seat.console.shift()
  })
  page.on('pageerror', error => seat.errors.push(`${new Date().toISOString()} ${error.message}`))
  if (url) {
    await page.goto(withViewLog(url))
  } else {
    // The host seat creates the room: the creator is the host.
    await page.goto('/')
    await page.getByRole('button', { name: 'Create Game' }).click()
    await page.waitForURL(/\/room\//)
    await page.goto(withViewLog(page.url()))
  }
  if (name !== 'Booth') {
    await page.locator('.input-text input').fill(name)
    await page.getByRole('button', { name: 'Save' }).click()
  }
  return seat
}

for (let room = 0; room < ROOMS; room += 1) {
  test(`playtest room ${room}`, async ({ browser, request }) => {
    test.setTimeout(GAME_BUDGET_MS + 5 * 60_000)
    expect(DEBUG_TOKEN, 'PLAYTEST_DEBUG_TOKEN must match the server').toBeTruthy()

    const seats: Seat[] = [await openSeat(browser, 'Host')]
    const roomUrl = seats[0]!.page.url().replace(/[?&]viewlog=1/, '')
    const gameId = new URL(roomUrl).pathname.split('/').pop()!
    for (let index = 1; index < SEATS; index += 1) {
      seats.push(await openSeat(browser, `Guest ${index}`, roomUrl))
    }
    const host = seats[0]!.page

    // The host's controls enable once its own seat lands in the snapshot.
    const length = host
      .getByRole('radiogroup', { name: 'Length' })
      .getByRole('radio', { name: new RegExp(LENGTH, 'i') })
    await expect(length).toBeEnabled({ timeout: 15_000 })
    if ((await length.getAttribute('aria-checked')) !== 'true') await length.click()
    if (SPECTATOR) {
      await host.getByRole('button', { name: 'Customize challenges' }).click()
      await host
        .getByRole('radiogroup', { name: 'Spectators' })
        .getByRole('radio', { name: 'on' })
        .click()
      await host.getByRole('button', { name: 'Done' }).click()
    }
    for (let bot = 0; bot < BOTS; bot += 1) {
      await host.locator('.add-bot').click({ timeout: 15_000 })
      await host.waitForTimeout(400)
    }
    await expect(host.getByRole('heading', { name: 'Ready to start!' })).toBeVisible()
    // The phone lobby shortens the label to "Start".
    await host.getByRole('button', { name: /^Start( Game)?$/ }).click({ timeout: 15_000 })
    const booth = SPECTATOR ? await openSeat(browser, 'Booth', roomUrl) : undefined

    const outDir = path.join(OUT_DIR, gameId)
    fs.mkdirSync(path.join(outDir, 'views'), { recursive: true })
    const incidents: Incident[] = []
    const warnings: string[] = []
    const serverReport: string[] = []
    const watches = new Map<string, CursorWatch>()
    const started = Date.now()
    let logOffset = SERVER_LOG && fs.existsSync(SERVER_LOG) ? fs.statSync(SERVER_LOG).size : 0
    let finished = false
    let latest: RoomRead | undefined

    /** Track each seat's server cursor: when its (step, subject) last moved,
     *  and every subject it has left — a subject never comes back. */
    const watchCursors = (room: RoomRead) => {
      const loops: { seat: DebugSeat; subject: string }[] = []
      for (const seat of room.seats) {
        const key = cursorKey(seat)
        const watch = watches.get(seat.id)
        if (!watch) {
          watches.set(seat.id, { key, since: room.readAt, subjects: [seat.subject] })
          continue
        }
        if (watch.key === key) continue
        watch.key = key
        watch.since = room.readAt
        if (watch.subjects.at(-1) === seat.subject) continue
        if (watch.subjects.includes(seat.subject)) loops.push({ seat, subject: seat.subject })
        watch.subjects.push(seat.subject)
      }
      return loops
    }

    /** The seat is following the game: its page rendered the server's cursor
     *  and no transition is hanging. */
    const seatFollows = async (seat: Seat): Promise<boolean> => {
      const probe = await readProbe(seat.page)
      const room = await readRoom(request, gameId)
      const truth = room?.seats.find(entry => entry.id === probe?.playerId)
      if (!probe || !truth) return false
      const trace = probe.transition
      const leaving = (trace.leaveStartedAt ?? 0) > (trace.leaveDoneAt ?? 0)
      return (
        cursorKey(truth.rendered) === cursorKey(truth) &&
        !(leaving && probe.at - trace.leaveStartedAt! > TRANSITION_STUCK_MS)
      )
    }

    const report = async (seat: Seat, kind: string, detail: string) => {
      const incident: Incident = {
        kind,
        seat: seat.name,
        at: new Date().toISOString(),
        detail,
        probe: seat.history.at(-1),
        server: latest?.seats,
      }
      const tag = `${incidents.length}-${kind.replace(/[^\w-]/g, '_')}-${seat.name.replace(/\s/g, '')}`
      await seat.page.screenshot({ path: path.join(outDir, `${tag}.png`) }).catch(() => undefined)
      fs.writeFileSync(
        path.join(outDir, `${tag}.json`),
        JSON.stringify(
          {
            incident,
            room: latest,
            history: seat.history.slice(-90),
            viewLog: await readViewLog(seat.page),
            errors: seat.errors,
            console: seat.console.slice(-300),
          },
          null,
          2
        )
      )
      console.log(`[playtest ${gameId}] ${kind} on ${seat.name}: ${detail}`)

      // Slow or frozen? Watch the seat recover on its own first; only a seat
      // still lost after the window is a freeze — then the player's way out:
      // does a refresh bring it back?
      if (!EVIDENCE_ONLY.has(kind.split(':')[0]!)) {
        const watchStart = Date.now()
        while (Date.now() - watchStart < SELF_HEAL_MS) {
          await seat.page.waitForTimeout(1000)
          if (await seatFollows(seat)) {
            incident.selfHealedMs = Date.now() - watchStart
            break
          }
        }
        if (incident.selfHealedMs === undefined) {
          await seat.page
            .screenshot({ path: path.join(outDir, `${tag}-frozen.png`) })
            .catch(() => undefined)
          const healStart = Date.now()
          await seat.page.reload().catch(() => undefined)
          let healed = false
          while (Date.now() - healStart < HEAL_WINDOW_MS) {
            await seat.page.waitForTimeout(1000)
            if (await seatFollows(seat)) {
              healed = true
              break
            }
          }
          incident.healedByRefresh = healed
          incident.healMs = Date.now() - healStart
          seat.longTasksSeen = 0
          seat.history = []
        }
        console.log(
          `[playtest ${gameId}] ${kind} on ${seat.name} ` +
            (incident.selfHealedMs !== undefined
              ? `recovered on its own after ${incident.selfHealedMs}ms`
              : `FROZEN — refresh ${incident.healedByRefresh ? 'healed it' : 'did NOT heal it'}`)
        )
      }
      incidents.push(incident)
    }

    /** Report once per key until the condition clears. */
    const once = async (seat: Seat, key: string, holds: boolean, detail: () => string) => {
      if (!holds) return void seat.open.delete(key)
      if (seat.open.has(key)) return
      seat.open.add(key)
      await report(seat, key, detail())
    }

    const tickSeat = async (seat: Seat, room: RoomRead | undefined) => {
      if (CHAOS && Date.now() > seat.quietUntil && Math.random() < CHAOS_ODDS) {
        const [shortest, longest] = CHAOS_OFFLINE_MS
        const outage = randomBetween(shortest, longest)
        seat.quietUntil = Date.now() + outage + RECONNECT_WINDOW_MS
        warnings.push(
          `${seat.name}: chaos offline ${Math.round(outage)}ms at ${new Date().toISOString()}`
        )
        const context = seat.page.context()
        await context.setOffline(true)
        setTimeout(() => void context.setOffline(false).catch(() => undefined), outage)
      }
      const probe = await readProbe(seat.page)
      if (!probe) return
      const previous = seat.history.at(-1)
      if (previous && probe.at - previous.at > PROBE_GAP_MS) {
        warnings.push(
          `${seat.name}: no probe for ${probe.at - previous.at}ms before ${new Date(probe.at).toISOString()}`
        )
      }
      seat.history.push(probe)
      if (seat.history.length > 3000) seat.history.shift()

      // The client never moves a cursor backwards, whatever the wire did.
      if (previous?.cursor && probe.cursor) {
        await once(
          seat,
          `client-seq-regressed:${probe.cursor.seq}`,
          probe.cursor.seq < previous.cursor.seq,
          () => `client cursor seq ${previous.cursor!.seq} → ${probe.cursor!.seq}`
        )
      }

      const trace = probe.transition
      const leaveAge =
        (trace.leaveStartedAt ?? 0) > (trace.leaveDoneAt ?? 0)
          ? probe.at - trace.leaveStartedAt!
          : 0
      const enterAge =
        (trace.enterStartedAt ?? 0) > (trace.enterDoneAt ?? 0) &&
        (trace.enterStartedAt ?? 0) > (trace.leaveStartedAt ?? 0)
          ? probe.at - trace.enterStartedAt!
          : 0
      const stuckAt =
        leaveAge > TRANSITION_STUCK_MS
          ? trace.leaveStartedAt
          : enterAge > TRANSITION_STUCK_MS
            ? trace.enterStartedAt
            : undefined
      if (stuckAt) {
        await once(
          seat,
          `transition-stuck:${stuckAt}`,
          true,
          () =>
            `${leaveAge ? 'leave' : 'enter'} transition open ${Math.max(leaveAge, enterAge)}ms: ${JSON.stringify(trace)}`
        )
      }

      if (SHOTS && probe.view && probe.view !== seat.lastView) {
        const shot = path.join(
          outDir,
          'views',
          `${seat.name.replace(/\s/g, '')}-${String(++seat.shots).padStart(3, '0')}-${probe.view.replace(/[^\w-]/g, '_')}.png`
        )
        setTimeout(
          () => void seat.page.screenshot({ path: shot }).catch(() => undefined),
          VIEW_SETTLE_MS
        )
      }
      seat.lastView = probe.view

      const quiet = Date.now() < seat.quietUntil
      const truth = room?.seats.find(entry => entry.id === probe.playerId)
      const watch = truth && watches.get(truth.id)
      if (truth && watch && !quiet) {
        // THE spec: a cursor the server has held still for RENDER_LAG_MS is on
        // its own player's screen, as the player's own ack told the server —
        // both sides of the comparison from the same read.
        const stableMs = room!.readAt - watch.since
        await once(
          seat,
          `render-lag:${cursorKey(truth)}`,
          stableMs >= RENDER_LAG_MS && cursorKey(truth.rendered) !== cursorKey(truth),
          () =>
            `server ${cursorKey(truth)} (seq ${truth.seq}) for ${stableMs}ms; ` +
            `page holds ${cursorKey(probe.cursor)} (seq ${probe.cursor?.seq}), ` +
            `rendered ${cursorKey(truth.rendered)}, view ${probe.view}`
        )
        await once(
          seat,
          'disconnected',
          probe.connected === false && stableMs >= DISCONNECT_MS,
          () => 'socket disconnected'
        )
      }

      const longTasks = await readLongTasks(seat.page)
      for (const task of longTasks.slice(seat.longTasksSeen)) {
        if (task.duration >= LONG_TASK_MS) {
          await report(seat, 'long-task', `main thread blocked ${task.duration}ms`)
        }
      }
      seat.longTasksSeen = longTasks.length

      if (seat.errors.length) {
        await report(seat, 'page-error', seat.errors.join(' | '))
        seat.errors = []
      }

      if (seat !== booth) await act(seat.page)
    }

    const tickRoom = async () => {
      const room = await readRoom(request, gameId)
      if (!room) {
        warnings.push(`no /debug/rooms read at ${new Date().toISOString()}`)
        return undefined
      }
      latest = room
      for (const { seat, subject } of watchCursors(room)) {
        await report(seats[0]!, 'subject-loop', `${seat.name ?? seat.id} re-entered ${subject}`)
      }
      for (const violation of room.violations) {
        await once(
          seats[0]!,
          `invariant:${violation.kind}:${violation.seat ?? 'table'}`,
          true,
          () => violation.detail
        )
      }
      const log = serverLines(gameId, logOffset)
      logOffset = log.to
      for (const line of log.lines.filter(line => SERVER_LINE.test(line))) {
        serverReport.push(line)
        incidents.push({
          kind: line.match(SERVER_LINE)![1]!,
          seat: 'server',
          at: new Date().toISOString(),
          detail: line.slice(0, 400),
        })
      }
      return room
    }

    while (Date.now() - started < GAME_BUDGET_MS) {
      const room = await tickRoom()

      // A tick can hold for a whole incident (the recovery watch, a reload):
      // the loop moves on after TICK_TIMEOUT_MS but never starts a second
      // tick on a seat whose first is still running. One that never returns
      // is itself the finding — a page too hung to answer the probe.
      const pages = booth ? [...seats, booth] : seats
      for (const seat of pages) {
        if (seat.ticking && !seat.tickHangReported && Date.now() - seat.ticking > TICK_HANG_MS) {
          seat.tickHangReported = true
          incidents.push({
            kind: 'tick-hang',
            seat: seat.name,
            at: new Date().toISOString(),
            detail: `no tick has returned for ${Math.round((Date.now() - seat.ticking) / 1000)}s`,
          })
        }
      }
      await Promise.all(
        pages
          .filter(seat => !seat.ticking)
          .map(async seat => {
            seat.ticking = Date.now()
            const tick = tickSeat(seat, room).finally(() => {
              seat.ticking = undefined
              seat.tickHangReported = false
            })
            let timer: ReturnType<typeof setTimeout> | undefined
            const timeout = new Promise<void>(resolve => {
              timer = setTimeout(() => {
                warnings.push(
                  `${seat.name}: tick exceeded ${TICK_TIMEOUT_MS}ms at ${new Date().toISOString()}`
                )
                resolve()
              }, TICK_TIMEOUT_MS)
            })
            await Promise.race([tick, timeout])
            clearTimeout(timer)
          })
      )

      const humans = room?.seats.filter(seat => !seat.bot) ?? []
      if (humans.length && humans.every(seat => seat.step === 'victory')) {
        finished = true
        break
      }
      await seats[0]!.page.waitForTimeout(TICK_MS)
    }

    const grammar: string[] = []
    const views: Record<string, string> = {}
    for (const seat of seats) {
      const log = await readViewLog(seat.page)
      views[seat.name] = log.map(entry => entry.key).join(' > ')
      for (const violation of viewLogViolations(log)) {
        // A seat whose socket was down across a beat resyncs straight into the
        // live view: the skipped board is the reconnect, not a dispatch bug.
        const reconnect = seat.history.some(
          probe =>
            probe.connected === false &&
            probe.at <= violation.at &&
            violation.at - probe.at <= RECONNECT_WINDOW_MS
        )
        const line = `${seat.name} @${new Date(violation.at).toISOString()}: ${violation.message}`
        if (reconnect) warnings.push(`${line} (after a disconnect)`)
        else grammar.push(line)
      }
    }

    const summary = {
      gameId,
      finished,
      minutes: Math.round((Date.now() - started) / 6000) / 10,
      seats: seats.length,
      bots: BOTS,
      spectator: !!booth,
      serverLogChecked: !!SERVER_LOG,
      incidents: incidents.map(({ probe: _probe, server: _server, ...rest }) => rest),
      serverLines: serverReport,
      grammar,
      warnings,
      views,
      subjects: Object.fromEntries([...watches].map(([id, watch]) => [id, watch.subjects])),
    }
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))
    console.log(`[playtest ${gameId}] ${JSON.stringify(summary, null, 2)}`)

    // A seat that caught up on its own was slow, not frozen — it stays in the
    // summary but does not fail the run, unless it was a render lag: the
    // contract says a stable cursor is on screen, full stop.
    const failures = incidents.filter(
      incident =>
        !NON_VERDICT.has(incident.kind) &&
        (incident.selfHealedMs === undefined || incident.kind.startsWith('render-lag'))
    )
    expect(failures.map(({ kind, seat, detail }) => `${kind} ${seat}: ${detail}`)).toEqual([])
    expect(grammar).toEqual([])
    if (REQUIRE_VICTORY) {
      expect(finished, 'every human seat reaches victory inside the budget').toBe(true)
    }
  })
}
