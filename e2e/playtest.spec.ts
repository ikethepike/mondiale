import fs from 'node:fs'
import path from 'node:path'
import { devices, expect, test, type Browser, type Page } from '@playwright/test'
import { Redis } from '@upstash/redis'
import {
  BOARD_TO_CHALLENGE_HOLD_MS,
  BRIEFING_CAP_MS,
  CLASSIC_SETTLE_SLACK_MS,
  GROUP_SCORES_CAP_MS,
  INDIVIDUAL_GATE_CAP_MS,
  TUTORIAL_CAP_MS,
  UNTIMED_CLASSIC_CAP_SECONDS,
} from '~~/lib/round-beats'
import type { GameProbe, PlaytestScope } from '~~/lib/playtest-probe'
import type { Game } from '~~/types/game.types'
import { viewLogViolations } from './view-log'

/**
 * The playtest client: real browser seats play whole games beside server bots
 * while a detector compares every page against the server's own record (read
 * straight from redis) and flags the moment a seat stops following the game.
 *
 * Runs under playwright.playtest.config.ts. Knobs: PLAYTEST_ROOMS (parallel
 * rooms), PLAYTEST_SEATS (browser seats per room), PLAYTEST_BOTS,
 * PLAYTEST_MINUTES (per-game budget), PLAYTEST_LENGTH (short|medium|long),
 * PLAYTEST_SERVER_LOG (server stdout file, tailed into incident reports),
 * PLAYTEST_DEVICE (a Playwright device name, e.g. "iPhone 14"), PLAYTEST_CHAOS=1
 * (seats drop offline at random), PLAYTEST_BROWSER=webkit (in the config),
 * PLAYTEST_SHOTS=1 (a screenshot of every view once it settles).
 */

const ROOMS = Number(process.env.PLAYTEST_ROOMS ?? 1)
const SEATS = Number(process.env.PLAYTEST_SEATS ?? 2)
const BOTS = Number(process.env.PLAYTEST_BOTS ?? 2)
const GAME_BUDGET_MS = Number(process.env.PLAYTEST_MINUTES ?? 40) * 60_000
const LENGTH = process.env.PLAYTEST_LENGTH ?? 'short'
const SERVER_LOG = process.env.PLAYTEST_SERVER_LOG
const DEVICE = process.env.PLAYTEST_DEVICE
const CHAOS = process.env.PLAYTEST_CHAOS === '1'
const OUT_DIR = path.resolve(process.env.PLAYTEST_OUT ?? 'test-results/playtest')

/** The longest a healthy room can go without a single save: every seat
 *  parked on a server cap that has yet to fire. */
const SERVER_SILENCE_MS =
  Math.max(
    UNTIMED_CLASSIC_CAP_SECONDS * 1000,
    GROUP_SCORES_CAP_MS,
    INDIVIDUAL_GATE_CAP_MS,
    TUTORIAL_CAP_MS,
    BRIEFING_CAP_MS
  ) +
  CLASSIC_SETTLE_SLACK_MS +
  30_000
const PARK_STUCK_MS = BOARD_TO_CHALLENGE_HOLD_MS + 2500
const TRANSITION_STUCK_MS = 4000
const LAG_MS = 8000
const DISCONNECT_MS = 15_000
const LONG_TASK_MS = 2500
const HEAL_WINDOW_MS = 30_000
/** How long a stalled seat gets to recover on its own before it counts as frozen. */
const SELF_HEAL_MS = 30_000
const TICK_MS = 1000
const PROBE_GAP_MS = 6000
/** Chaos mode: per tick, the chance a seat drops offline, and for how long. */
const CHAOS_ODDS = 1 / 90
const CHAOS_OFFLINE_MS: [number, number] = [2000, 8000]
/** How long after a disconnect a skipped beat is the reconnect's resync. */
const RECONNECT_WINDOW_MS = 15_000
const TICK_TIMEOUT_MS = 15_000
/** Screenshot every presented view once it settles (PLAYTEST_SHOTS=1). */
const SHOTS = process.env.PLAYTEST_SHOTS === '1'
const VIEW_SETTLE_MS = 3000
/** How long after a swap the previous view must be gone from the screen. */
const RESIDUE_CHECK_MS = 5000
/** Kinds reported as evidence: no recovery watch, no reload. */
const EVIDENCE_ONLY = new Set(['long-task', 'page-error', 'server-silence', 'residue'])

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
  server?: unknown
}

interface Seat {
  name: string
  page: Page
  history: GameProbe[]
  since: Map<string, number>
  open: Set<string>
  seenGates: Set<string>
  lastPresented?: string
  longTasksSeen: number
  errors: string[]
  console: string[]
  /** Until when chaos holds this seat offline — lag checks wait it out. */
  offlineUntil: number
  shots: number
  /** The last view swap, held until its residue check has run. */
  swap?: { at: number; from?: string; to?: string; prompts: string[]; verdicts: string[] }
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!

const readProbe = (page: Page) =>
  page.evaluate(() => (window as unknown as PlaytestScope).__gameProbe?.()).catch(() => undefined)

const readLongTasks = (page: Page) =>
  page
    .evaluate(() => (window as unknown as PlaytestScope).__longTasks ?? [])
    .catch(() => [] as { at: number; duration: number }[])

const readViewLog = (page: Page) =>
  page.evaluate(() => (window as unknown as PlaytestScope).__viewLog ?? []).catch(() => [])

const withViewLog = (url: string) => `${url}${url.includes('?') ? '&' : '?'}viewlog=1`

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
    if (optionCount)
      return void (await options.nth(Math.floor(Math.random() * optionCount)).click(quick))

    const input = page.locator('.guess-form input:visible').first()
    if ((await input.count()) && (await input.isEnabled())) {
      await input.fill(pick(GUESSES), quick)
      await input.press('Enter', quick)
      return
    }

    await page.evaluate(
      isoCode => document.dispatchEvent(new CustomEvent('mapClick', { detail: { isoCode } })),
      pick(MAP_CODES)
    )
  } catch {
    // A view swapped under the click — the next tick reads the new one.
  }
}

const serverTail = (gameId: string) => {
  if (!SERVER_LOG || !fs.existsSync(SERVER_LOG)) return ''
  const lines = fs.readFileSync(SERVER_LOG, 'utf8').split('\n')
  return lines
    .filter(line => line.includes(gameId) || /heal|wedg|strand|stale|error|warn/i.test(line))
    .slice(-150)
    .join('\n')
}

const openSeat = async (browser: Browser, name: string, url?: string): Promise<Seat> => {
  const context = await browser.newContext(
    DEVICE ? devices[DEVICE] : { viewport: { width: 1280, height: 800 } }
  )
  const page = await context.newPage()
  const seat: Seat = {
    name,
    page,
    history: [],
    since: new Map(),
    open: new Set(),
    seenGates: new Set(),
    longTasksSeen: 0,
    errors: [],
    console: [],
    offlineUntil: 0,
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
  await page.locator('.input-text input').fill(name)
  await page.getByRole('button', { name: 'Save' }).click()
  return seat
}

for (let room = 0; room < ROOMS; room += 1) {
  test(`playtest room ${room}`, async ({ browser }) => {
    test.setTimeout(GAME_BUDGET_MS + 5 * 60_000)

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
    for (let bot = 0; bot < BOTS; bot += 1) {
      await host.locator('.add-bot').click({ timeout: 15_000 })
      await host.waitForTimeout(400)
    }
    await expect(host.getByRole('heading', { name: 'Ready to start!' })).toBeVisible()
    // The phone lobby shortens the label to "Start".
    await host.getByRole('button', { name: /^Start( Game)?$/ }).click({ timeout: 15_000 })

    const outDir = path.join(OUT_DIR, gameId)
    fs.mkdirSync(path.join(outDir, 'views'), { recursive: true })
    const incidents: Incident[] = []
    const warnings: string[] = []
    const started = Date.now()
    let lastServerRev: number | undefined
    let lastServerRevAt = Date.now()
    let finished = false

    /** The seat is following the game: same phase as the server, the view it
     *  resolves is the view on screen, and no transition is hanging. */
    const seatFollows = async (seat: Seat): Promise<boolean> => {
      const probe = await readProbe(seat.page)
      if (!probe) return false
      const fresh = await redis.get<Game>(gameId)
      const truth = probe.playerId ? fresh?.players[probe.playerId] : undefined
      const trace = probe.transition
      const leaving = (trace.leaveStartedAt ?? 0) > (trace.leaveDoneAt ?? 0)
      return (
        !!truth &&
        probe.phase === truth.phase &&
        probe.presented === probe.active &&
        !(leaving && probe.at - trace.leaveStartedAt! > TRANSITION_STUCK_MS)
      )
    }

    const report = async (seat: Seat, kind: string, detail: string, server?: Game) => {
      const stamp = new Date().toISOString()
      const incident: Incident = {
        kind,
        seat: seat.name,
        at: stamp,
        detail,
        probe: seat.history[seat.history.length - 1],
        server: server && {
          rev: server.rev,
          rounds: server.rounds.length,
          pendingRoundStart: server.pendingRoundStart,
          players: Object.values(server.players).map(player => ({
            name: player.name,
            phase: player.phase,
            position: player.currentPosition,
            resolving: player.resolving,
            resultBeatUntil: player.resultBeatUntil,
            moves: player.moves.map(move => move.challenge?._type ?? 'walk'),
          })),
        },
      }
      const tag = `${incidents.length}-${kind}-${seat.name.replace(/\s/g, '')}`
      await seat.page.screenshot({ path: path.join(outDir, `${tag}.png`) }).catch(() => undefined)
      fs.writeFileSync(
        path.join(outDir, `${tag}.json`),
        JSON.stringify(
          {
            incident,
            history: seat.history.slice(-90),
            viewLog: await readViewLog(seat.page),
            errors: seat.errors,
            console: seat.console.slice(-300),
            serverLog: serverTail(gameId),
          },
          null,
          2
        )
      )
      console.log(`[playtest ${gameId}] ${kind} on ${seat.name}: ${detail}`)

      // Slow or frozen? Watch the seat recover on its own first; only a seat
      // still lost after the window is a freeze — then the player's way out:
      // does a refresh bring it back?
      if (!EVIDENCE_ONLY.has(kind)) {
        const watchStart = Date.now()
        while (Date.now() - watchStart < SELF_HEAL_MS) {
          await seat.page.waitForTimeout(1000)
          if (await seatFollows(seat)) {
            incident.selfHealedMs = Date.now() - watchStart
            break
          }
        }
        if (incident.selfHealedMs === undefined) {
          const longTasks = await readLongTasks(seat.page)
          fs.writeFileSync(
            path.join(outDir, `${tag}-frozen.json`),
            JSON.stringify(
              {
                history: seat.history.slice(-60),
                longTasks,
                console: seat.console.slice(-300),
                serverLog: serverTail(gameId),
              },
              null,
              2
            )
          )
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
        }
        seat.since.clear()
        seat.open.clear()
        console.log(
          `[playtest ${gameId}] ${kind} on ${seat.name} ` +
            (incident.selfHealedMs !== undefined
              ? `recovered on its own after ${incident.selfHealedMs}ms`
              : `FROZEN — refresh ${incident.healedByRefresh ? 'healed it' : 'did NOT heal it'}`)
        )
      }
      incidents.push(incident)
    }

    /** A condition must hold continuously for `ms` before it is an incident,
     *  and reports once until it clears. */
    const sustained = async (
      seat: Seat,
      kind: string,
      holds: boolean,
      ms: number,
      detail: () => string,
      server?: Game
    ) => {
      // A keyed kind (`phase-lag:a>b`) restarts its clock when the pair
      // changes — two different mismatches back to back are not one stall.
      const family = kind.split(':')[0]!
      for (const key of [...seat.since.keys()]) {
        if (key !== kind && key.split(':')[0] === family) seat.since.delete(key)
      }
      if (!holds) {
        seat.since.delete(kind)
        seat.open.delete(kind)
        return
      }
      const since = seat.since.get(kind) ?? Date.now()
      seat.since.set(kind, since)
      if (!seat.open.has(kind) && Date.now() - since >= ms) {
        seat.open.add(kind)
        await report(seat, kind, detail(), server)
      }
    }

    const readServer = async () => (await redis.get<Game>(gameId)) ?? undefined
    /** Silence is the SERVER's: any read that sees a new rev resets it, so a
     *  driver tick that stalls can never pass for a frozen room. */
    const noteServerRev = (server: Game | undefined) => {
      if (server?.rev === lastServerRev) return
      lastServerRev = server?.rev
      lastServerRevAt = Date.now()
    }

    const tickSeat = async (seat: Seat) => {
      if (CHAOS && Date.now() > seat.offlineUntil && Math.random() < CHAOS_ODDS) {
        const [shortest, longest] = CHAOS_OFFLINE_MS
        const outage = shortest + Math.random() * (longest - shortest)
        seat.offlineUntil = Date.now() + outage
        warnings.push(
          `${seat.name}: chaos offline ${Math.round(outage)}ms at ${new Date().toISOString()}`
        )
        const context = seat.page.context()
        await context.setOffline(true)
        setTimeout(() => void context.setOffline(false).catch(() => undefined), outage)
      }
      const probe = await readProbe(seat.page)
      if (!probe) return
      const previous = seat.history[seat.history.length - 1]
      if (previous && probe.at - previous.at > PROBE_GAP_MS) {
        warnings.push(
          `${seat.name}: no probe for ${probe.at - previous.at}ms before ${new Date(probe.at).toISOString()}`
        )
      }
      seat.history.push(probe)
      if (seat.history.length > 3000) seat.history.shift()
      // A seat chaos holds offline is SUPPOSED to lag; its clocks start once
      // the network is back.
      if (Date.now() < seat.offlineUntil) {
        seat.since.clear()
        return
      }
      // Read AFTER the probe, so the server's record is never older than the
      // page's: a client that is ahead is only the read racing a save.
      const server = await readServer()
      noteServerRev(server)
      const truth = probe.playerId ? server?.players[probe.playerId] : undefined
      const behind = (probe.rev ?? 0) < (server?.rev ?? 0)
      const trace = probe.transition

      await sustained(
        seat,
        `park-stuck:${probe.presented}>${probe.active}`,
        !!probe.presented && !!probe.active && probe.presented !== probe.active,
        PARK_STUCK_MS,
        () => `presented ${probe.presented} but active ${probe.active}`,
        server
      )
      // Keyed by the transition's own start, never sustained across swaps: a
      // quick re-swap cancels an enter (Vue never calls its done), so an enter
      // only counts while no later leave has superseded it.
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
      if (stuckAt && !seat.open.has(`transition:${stuckAt}`)) {
        seat.open.add(`transition:${stuckAt}`)
        await report(
          seat,
          'transition-stuck',
          `${leaveAge ? 'leave' : 'enter'} transition open ${Math.max(leaveAge, enterAge)}ms: ${JSON.stringify(trace)}`,
          server
        )
      }
      await sustained(
        seat,
        `phase-lag:${probe.phase}>${truth?.phase}`,
        !!truth && behind && truth.phase !== probe.phase,
        LAG_MS,
        () =>
          `client phase ${probe.phase}, server phase ${truth?.phase} (rev ${probe.rev}/${server?.rev})`,
        server
      )
      await sustained(
        seat,
        `position-lag:${probe.position}>${truth?.currentPosition}`,
        !!truth && behind && truth.currentPosition !== probe.position,
        LAG_MS,
        () => `client pawn at ${probe.position}, server at ${truth?.currentPosition}`,
        server
      )
      await sustained(
        seat,
        'disconnected',
        probe.connected === false,
        DISCONNECT_MS,
        () => 'socket disconnected',
        server
      )

      // The loop the field report described: a gate presented again on the
      // same round at the same tile it was already played on.
      const presented = probe.presented
      if (presented !== seat.lastPresented) {
        const before = previous?.screen
        seat.swap = {
          at: probe.at,
          from: seat.lastPresented,
          to: presented,
          prompts: before?.prompts ?? [],
          verdicts: before?.verdicts ?? [],
        }
        if (SHOTS && presented) {
          const shot = path.join(
            outDir,
            'views',
            `${seat.name.replace(/\s/g, '')}-${String(++seat.shots).padStart(3, '0')}-${presented}.png`
          )
          setTimeout(
            () => void seat.page.screenshot({ path: shot }).catch(() => undefined),
            VIEW_SETTLE_MS
          )
        }
        if (presented === 'individual-challenge') {
          const gate = `${probe.rounds}:${probe.position}`
          if (seat.seenGates.has(gate)) {
            await report(
              seat,
              'gate-loop',
              `gate at tile ${probe.position} re-presented in round ${probe.rounds}`,
              server
            )
          }
          seat.seenGates.add(gate)
        }
        seat.lastPresented = presented
      }

      // What the swap left painted: the previous view's prompt or verdict
      // still on screen under the new one, two view roots, or the layout's
      // reveal card over the board or the scorecard.
      const swap = seat.swap
      if (swap && probe.at - swap.at >= RESIDUE_CHECK_MS && probe.presented === swap.to) {
        seat.swap = undefined
        const screen = probe.screen
        const leftovers = [
          ...screen.prompts
            .filter(text => swap.prompts.includes(text))
            .map(text => `prompt "${text}"`),
          ...screen.verdicts
            .filter(text => swap.verdicts.includes(text))
            .map(text => `verdict "${text}"`),
          ...(screen.viewRoots > 1 ? [`${screen.viewRoots} view roots mounted`] : []),
          ...(screen.revealCard && (swap.to === 'board' || swap.to === 'group-scores')
            ? ['layout reveal card']
            : []),
        ]
        if (leftovers.length) {
          await report(
            seat,
            'residue',
            `${swap.from}→${swap.to} left ${leftovers.join(', ')}`,
            server
          )
        }
      }

      const longTasks = await readLongTasks(seat.page)
      for (const task of longTasks.slice(seat.longTasksSeen)) {
        if (task.duration >= LONG_TASK_MS) {
          await report(seat, 'long-task', `main thread blocked ${task.duration}ms`, server)
        }
      }
      seat.longTasksSeen = longTasks.length

      if (seat.errors.length) {
        await report(seat, 'page-error', seat.errors.join(' | '), server)
        seat.errors = []
      }

      await act(seat.page)
    }

    while (Date.now() - started < GAME_BUDGET_MS) {
      const server = await readServer()
      noteServerRev(server)

      await Promise.all(
        seats.map(seat =>
          Promise.race([
            tickSeat(seat),
            new Promise<void>(resolve =>
              setTimeout(() => {
                warnings.push(
                  `${seat.name}: tick exceeded ${TICK_TIMEOUT_MS}ms at ${new Date().toISOString()}`
                )
                resolve()
              }, TICK_TIMEOUT_MS)
            ),
          ])
        )
      )

      if (Date.now() - lastServerRevAt > SERVER_SILENCE_MS) {
        await report(
          seats[0]!,
          'server-silence',
          `no save for ${Math.round((Date.now() - lastServerRevAt) / 1000)}s`,
          server
        )
        lastServerRevAt = Date.now()
      }

      const humans = Object.values(server?.players ?? {}).filter(
        player => !player.id.startsWith('bot:')
      )
      if (humans.length && humans.every(player => player.phase === 'victory')) {
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
      incidents: incidents.map(({ probe: _probe, server: _server, ...rest }) => rest),
      grammar,
      warnings,
      views,
    }
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))
    console.log(`[playtest ${gameId}] ${JSON.stringify(summary, null, 2)}`)

    // A seat that caught up on its own was slow, not frozen — it stays in the
    // summary but does not fail the run. Long tasks are evidence, not verdicts.
    const frozen = incidents.filter(
      incident => incident.selfHealedMs === undefined && incident.kind !== 'long-task'
    )
    expect(frozen.map(({ kind, seat, detail }) => `${kind} ${seat}: ${detail}`)).toEqual([])
    expect(grammar).toEqual([])
  })
}
