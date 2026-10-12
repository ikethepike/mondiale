import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { ClientEventData, SeatEcho } from '~~/types/events.types'
import type { SeatCursor } from '~~/types/seat.types'
import { stripComments, stripScriptComments } from '~~/scripts/source-scrape'

/**
 * The seat-cursor contract (#174), pinned as source scrapes over code with its
 * comments blanked: one writer, no legacy staleness tokens, every server wait
 * owned by a named home, every client timer reviewed, and every seat event
 * echoing the cursor it answers. A count drifting here is a review, not a
 * typo — update the census only after reading the new code against the
 * contract.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SOURCE_DIRS = ['lib', 'server', 'components', 'pages', 'layouts', 'plugins', 'store', 'types']

const isScaffolding = (file: string) =>
  /\.test\.ts$/.test(file) ||
  /\.gen\.ts$/.test(file) ||
  file.startsWith('pages/test') ||
  file.startsWith('lib/harness/') ||
  [
    'lib/events/server/test-table.ts',
    'lib/events/server/test-seat.ts',
    'lib/events/server/replay.ts',
  ].includes(file)

const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
    const relative = `${dir}/${entry.name}`
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(relative)
    return /\.(ts|vue)$/.test(entry.name) ? [relative] : []
  })

const runtimeFiles = SOURCE_DIRS.flatMap(walk).filter(file => !isScaffolding(file))
const read = (file: string) => stripComments(file, fs.readFileSync(path.join(ROOT, file), 'utf8'))
const sources = new Map(runtimeFiles.map(file => [file, read(file)]))

const hits = (pattern: RegExp, files: Iterable<string> = sources.keys()) => {
  const found: Record<string, number> = {}
  for (const file of files) {
    const count = (sources.get(file) ?? read(file)).match(new RegExp(pattern, 'g'))?.length ?? 0
    if (count) found[file] = count
  }
  return found
}

const isServerFile = (file: string) =>
  file.startsWith('lib/events/server/') ||
  file.startsWith('server/') ||
  file === 'lib/events/server-side.ts'

/** Reading the local wall clock, however the call is spaced or wrapped. */
const LOCAL_CLOCK = /\b(Date|performance)\s*\.\s*now\s*\(\s*\)|\bnew\s+Date\s*\(\s*\)/

/** Each expression on one line: a line that ends on an operator, or a line
 *  that opens on one, is joined to its neighbour. */
const statements = (source: string) =>
  source
    .replace(/\s*\n\s*(?=[.?)\]+\-*/%&|,:<>=])/g, ' ')
    .replace(/([([,=+\-*/%&|?:<>])\s*\n\s*/g, '$1 ')

describe('the scraper', () => {
  it('reads code, never comments', () => {
    const source = [
      '// setTimeout(() => advance())',
      "const url = 'http://example.com' /* x.cursor = y */",
      'const pattern = /\\/\\/[*]/g // seat.cursor.seq = 0',
      '/**',
      ' * if (eventData.subject !== cursor.subject) return',
      ' */',
      'const label = `a ${`b // ${c}`} // d`',
    ].join('\n')
    const code = stripScriptComments(source)
    expect(code).not.toMatch(/setTimeout|cursor|subject/)
    expect(code).toContain("'http://example.com'")
    expect(code).toContain('/\\/\\/[*]/g')
    expect(code).toContain('`a ${`b // ${c}`} // d`')
    expect(code.split('\n')).toHaveLength(7)
    expect(
      stripComments('x.vue', '<!-- setTimeout(a) -->\n<script>\n// setTimeout(b)\n</script>')
    ).not.toMatch(/setTimeout/)
  })
})

describe('single writer', () => {
  const CURSOR_FIELDS = Object.keys({
    seq: true,
    step: true,
    subject: true,
    enteredAt: true,
    holdUntil: true,
    deadline: true,
    verdict: true,
    hints: true,
    lit: true,
    spent: true,
    cause: true,
    walk: true,
    leg: true,
  } satisfies Record<keyof SeatCursor, true>).join('|')

  it('only the transition table, the legacy migration and the lobby seat assign a cursor', () => {
    expect(hits(/\.cursor\s*=(?!=)/)).toEqual({
      'lib/seat-transitions.ts': 1,
      'lib/events/server/seat-migrate.ts': 1,
    })
    expect(hits(/\bcursor:\s*initialSeatCursor\(/)).toEqual({ 'lib/player.ts': 1 })
  })

  it('nothing writes into a cursor in place, by field, bracket, merge or delete', () => {
    const writes = [
      new RegExp(
        `\\bcursor\\??\\.(${CURSOR_FIELDS})(\\??\\.\\w+|\\[[^\\]]+\\])*\\s*(=(?!=)|\\+\\+|--|[-+*/%&|^]=|\\?\\?=)`
      ),
      new RegExp(`(\\+\\+|--)\\s*[\\w.?]*\\bcursor\\??\\.(${CURSOR_FIELDS})\\b`),
      /\bcursor\s*\??\.?\[[^\]]+\]\s*(=(?!=)|\+\+|--|[-+*/]=)/,
      /\[\s*['"`]cursor['"`]\s*\]/,
      /\bObject\.(assign|defineProperty|defineProperties)\(\s*[\w.?[\]'"]*\bcursor\b/,
      /\bdelete\s+[\w.?[\]'"]*\bcursor\b/,
    ]
    expect(Object.assign({}, ...writes.map(pattern => hits(pattern)))).toEqual({})
  })

  it('only server code moves a seat', () => {
    const movers = Object.keys(hits(/\badvanceSeat\(/))
    expect(movers.filter(file => !isServerFile(file))).toEqual([])
    expect(Object.keys(hits(/\bapplySeatMove\(/))).toEqual(['lib/events/server/seat-cursor.ts'])
  })

  it('test scaffolding never reaches runtime code', () => {
    const scaffolding = /from '[^']*(test-table|test-seat|\/replay|lib\/harness\/[^']*)'/
    const leaks = runtimeFiles.filter(file => scaffolding.test(sources.get(file)!))
    expect(leaks.filter(file => !file.startsWith('pages/test'))).toEqual([])
  })
})

describe('legacy staleness tokens are gone', () => {
  const BANNED = [
    'walkSeq',
    'walkIntro',
    'lastStepAt',
    'resultBeatUntil',
    'pendingRoundStart',
    'finalBeats',
    'latestBeatFor',
    'FINAL_BEAT_TTL_MS',
    'armBeatFallback',
    'relatch',
    'gateSeq',
    '_WIRE_GRACE_MS',
    'CHALLENGE_SWAP_VERIFY_MS',
    'STEP_LATCH_SLACK_MS',
    'clearFinalResultBeat',
    'rearmSeatExits',
    'scheduleMovementPhase',
    'scheduleRevealFlip',
    'armIndividualGateCap',
    'armFinalQuestionCap',
    'armGroupScoresCaps',
    'walkParkedSeat',
    'orphanedInChallenge',
    'strandedSubmitter',
    'RetryableReject',
    "'final-beat'",
    'group-challenge-scored',
    'individual-challenge-checked',
    'final-challenge-checked',
    'PlayerPhase',
    'BOARD_PHASES',
    'SETTLED_PHASES',
    'ROUND_BOUND_PHASES',
    'presentedView',
    'DealReplay',
  ]
  // The one-shot loader for games saved before the cursor existed names the
  // fields it strips.
  const LEGACY_READERS = new Set(['lib/events/server/seat-migrate.ts'])

  it.each(BANNED)('%s', identifier => {
    const found = Object.keys(hits(new RegExp(identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))))
    expect(found.filter(file => !LEGACY_READERS.has(file))).toEqual([])
  })

  it('a seat has no phase and no resolving latch', () => {
    expect(hits(/\b(player|seat|live|racer|me|self|target)\??\.(phase|resolving)\b/)).toEqual({})
  })
})

describe('server waits', () => {
  const TIMER =
    /\b(setTimeout|setInterval|setImmediate|queueMicrotask|nextTick|scheduleGameTask|scheduleEngineTask|scheduleDeadlineTask|scheduleRevealTask)\(/
  /**
   * Every server-side timer call, by file. Seat waits live only in
   * seat-cursor.ts; engines arm TABLE waits that die on the named token;
   * the rest is infrastructure that never touches a game.
   */
  const SERVER_TIMERS: Record<string, { count: number; owner: string; token?: string }> = {
    'lib/events/server/seat-cursor.ts': {
      count: 2,
      owner: 'seat + table cursor',
      token: 'seq !== seq',
    },
    'lib/events/server/round-engine.ts': { count: 3, owner: 'the engine seam itself' },
    'lib/events/server/deferred-task.ts': { count: 1, owner: 'the timer→queue seam' },
    'lib/events/server/classic-rounds.ts': { count: 2, owner: 'table', token: 'groupAnswers' },
    'lib/events/server/chain-engine.ts': { count: 4, owner: 'table', token: 'state.turn' },
    'lib/events/server/government-beats.ts': { count: 3, owner: 'table', token: 'state.beat' },
    'lib/events/server/heritage-beats.ts': { count: 3, owner: 'table', token: 'state.beat' },
    'lib/events/server/manhunt-beats.ts': { count: 3, owner: 'table', token: 'state.turn' },
    'lib/events/server/sweep-beats.ts': { count: 3, owner: 'table', token: 'state.briefing' },
    'lib/events/server/terra-beats.ts': { count: 1, owner: 'table', token: 'state.briefing' },
    'lib/events/server/timeline-turns.ts': { count: 3, owner: 'table', token: 'state.turn' },
    'lib/events/server/unique-beats.ts': { count: 3, owner: 'table', token: 'state.briefing' },
    'lib/events/server/bot-brain.ts': {
      count: 25,
      owner: 'a bot thinking — every act re-checks seq',
      token: 'seq',
    },
    'lib/events/server/game-ownership.ts': { count: 1, owner: 'lease heartbeat' },
    'lib/events/server/game-routing.ts': { count: 1, owner: 'routing probe' },
    'lib/events/server/graceful-shutdown.ts': { count: 1, owner: 'drain cap' },
    'lib/events/server/seat-auditor.ts': { count: 1, owner: 'read-only auditor' },
    'server/plugins/memory-watch.ts': { count: 1, owner: 'memory sampler' },
  }

  it('every timer has a named owner, and the counts are reviewed', () => {
    expect(hits(TIMER, runtimeFiles.filter(isServerFile))).toEqual(
      Object.fromEntries(Object.entries(SERVER_TIMERS).map(([file, { count }]) => [file, count]))
    )
  })

  it("each engine's table wait names the token that kills it", () => {
    for (const [file, { token }] of Object.entries(SERVER_TIMERS)) {
      if (token) expect(sources.get(file), `${file} lost its ${token} guard`).toContain(token)
    }
  })

  it('only the cursor module arms a seat', () => {
    expect(Object.keys(hits(/\barmSeat\(/))).toEqual(['lib/events/server/seat-cursor.ts'])
    expect(Object.keys(hits(/\barmTable\(/))).toEqual(['lib/events/server/seat-cursor.ts'])
  })
})

describe('client timers', () => {
  type Category = 'cosmetic' | 'transport' | 'local-input' | 'server-clock'
  /** Every client timer, reviewed. None may submit, emit or move a phase. */
  const CLIENT_TIMERS: Record<string, { count: number; category: Category }> = {
    'components/GameMap.vue': { count: 6, category: 'cosmetic' },
    'components/challenge/ChallengeTimerRadial.vue': { count: 4, category: 'cosmetic' },
    'components/challenge/AudioFieldGl.client.vue': { count: 3, category: 'cosmetic' },
    'lib/useGroupChallenge.ts': { count: 3, category: 'cosmetic' },
    'lib/useOutlineReveal.ts': { count: 2, category: 'cosmetic' },
    'lib/use-viewport.ts': { count: 2, category: 'local-input' },
    'lib/use-map-viewbox.ts': { count: 2, category: 'cosmetic' },
    'lib/events/client-side.ts': { count: 2, category: 'transport' },
    'components/challenge/PyramidTimeline.vue': { count: 2, category: 'cosmetic' },
    'components/view/ViewComposition.vue': { count: 1, category: 'cosmetic' },
    'components/map/ContourBackdropGl.client.vue': { count: 2, category: 'cosmetic' },
    'components/challenge/ZoomableImage.vue': { count: 2, category: 'cosmetic' },
    'components/challenge/FinalChangeFrames.vue': { count: 2, category: 'cosmetic' },
    'components/challenge/AudioDock.vue': { count: 2, category: 'local-input' },
    'components/KeyboardLab.client.vue': { count: 2, category: 'cosmetic' },
    'plugins/socket.client.ts': { count: 1, category: 'transport' },
    'lib/use-server-now.ts': { count: 1, category: 'server-clock' },
    'lib/use-lockout-beat.ts': { count: 1, category: 'local-input' },
    'lib/use-intro-beat.ts': { count: 1, category: 'cosmetic' },
    'lib/use-reveal-settle.ts': { count: 1, category: 'cosmetic' },
    'lib/use-ephemeral-ticker.ts': { count: 1, category: 'cosmetic' },
    'lib/use-bottom-sheet.ts': { count: 1, category: 'local-input' },
    'lib/time.ts': { count: 1, category: 'transport' },
    'lib/board3d/use-pawn-movement.ts': { count: 1, category: 'cosmetic' },
    'lib/board3d/use-board-camera.ts': { count: 1, category: 'local-input' },
    'layouts/default.vue': { count: 1, category: 'cosmetic' },
    'components/view/ViewVictory.vue': { count: 1, category: 'cosmetic' },
    'components/view/ViewTrendRace.vue': { count: 1, category: 'cosmetic' },
    'components/view/ViewTerraIncognita.vue': { count: 1, category: 'cosmetic' },
    'components/view/ViewPlayerConfiguration.vue': { count: 1, category: 'cosmetic' },
    'components/view/ViewManhunt.vue': { count: 3, category: 'local-input' },
    'components/view/ViewBorderChain.vue': { count: 1, category: 'cosmetic' },
    'components/view/ViewAtlas.vue': { count: 1, category: 'cosmetic' },
    'components/view/ViewFinalChallenge.vue': { count: 1, category: 'cosmetic' },
    'components/view/ViewAnthemBuzz.vue': { count: 1, category: 'cosmetic' },
    'components/spectate/SpectateBar.vue': { count: 1, category: 'local-input' },
    'components/player/PlayerStatusPanel.vue': { count: 1, category: 'local-input' },
    'components/map/MapInset.vue': { count: 1, category: 'cosmetic' },
    'components/feedback/SourceInfo.vue': { count: 1, category: 'cosmetic' },
    'components/feedback/ReconnectToast.vue': { count: 1, category: 'cosmetic' },
    'components/challenge/individual/GateTrendDuel.vue': { count: 1, category: 'local-input' },
    'components/challenge/individual/GateAtlas.vue': { count: 1, category: 'cosmetic' },
    'components/challenge/VintageField.vue': { count: 2, category: 'cosmetic' },
    'components/challenge/SunsetVeil.vue': { count: 1, category: 'cosmetic' },
    'components/challenge/ParliamentStage.client.vue': { count: 2, category: 'cosmetic' },
    'components/challenge/FinalSunsetBlitz.vue': { count: 1, category: 'cosmetic' },
    'components/challenge/FinalScales.vue': { count: 1, category: 'cosmetic' },
    'components/challenge/DragDial.vue': { count: 1, category: 'local-input' },
    'components/board3d/TopoScene.vue': { count: 1, category: 'cosmetic' },
    'components/board3d/BoardStage.client.vue': { count: 2, category: 'cosmetic' },
  }
  const PLATFORM_TIMERS = [
    'setTimeout',
    'setInterval',
    'requestAnimationFrame',
    'requestIdleCallback',
    'queueMicrotask',
  ]
  const clientFiles = runtimeFiles.filter(file => !isServerFile(file))

  /** The platform timers plus every scheduler `createViewTimer()` handed this file. */
  const timerPattern = (source: string) => {
    const schedulers = [
      ...source.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*createViewTimer\(\s*\)/g),
    ].map(match => match[1]!)
    return new RegExp(`\\b(${[...PLATFORM_TIMERS, ...schedulers].join('|')})\\(`, 'g')
  }

  it('every client timer is reviewed and counted', () => {
    const counted = Object.fromEntries(
      clientFiles.flatMap(file => {
        const source = sources.get(file)!
        const count = source.match(timerPattern(source))?.length ?? 0
        return count ? [[file, count]] : []
      })
    )
    expect(counted).toEqual(
      Object.fromEntries(Object.entries(CLIENT_TIMERS).map(([file, { count }]) => [file, count]))
    )
  })

  /** The callback text of every timer call — the balanced argument list. */
  const timerArguments = (source: string) => {
    const calls: string[] = []
    for (const match of source.matchAll(timerPattern(source))) {
      let depth = 0
      let at = match.index! + match[0].length - 1
      const start = at
      for (; at < source.length; at++) {
        if (source[at] === '(') depth++
        if (source[at] === ')' && --depth === 0) break
      }
      calls.push(source.slice(start, at + 1))
    }
    return calls
  }

  /** The text of the function this file defines as `name`, through its closing line. */
  const definitionOf = (source: string, name: string): string | undefined => {
    const start = source.search(
      new RegExp(`\\b((const|let|var)\\s+${name}\\s*=|function\\s*\\*?\\s*${name}\\s*\\()`)
    )
    if (start === -1) return undefined
    let depth = 0
    for (let at = start; at < source.length; at++) {
      const char = source[at]!
      if ('([{'.includes(char)) depth++
      else if (')]}'.includes(char)) depth--
      else if (char === '\n' && depth <= 0) {
        const line = source.slice(start, at)
        if (!/(=>|[=,(?:]|&&|\|\|)\s*$/.test(line)) return line
      }
    }
    return source.slice(start)
  }

  /** A timer call plus every same-file function it names — passed bare or called. */
  const reachedFrom = (source: string, call: string) => {
    const texts = [call]
    const seen = new Set<string>()
    for (let index = 0; index < texts.length; index++) {
      const named = [
        ...texts[index]!.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g),
        ...texts[index]!.matchAll(/[(,]\s*([A-Za-z_$][\w$]*)\s*(?=[,)])/g),
      ].map(match => match[1]!)
      for (const name of named) {
        if (seen.has(name)) continue
        seen.add(name)
        const definition = definitionOf(source, name)
        if (definition) texts.push(definition)
      }
    }
    return texts.join('\n')
  }

  const ACTING =
    /\bupdate\((?!\s*\))|\b(submitOnce|submit[A-Z]\w*|submitAnswer|advance\w*|enterMovement\w*|closeTutorial)\(|socket\.emit\(|\bemit\('(submit|answer|continue|done)/

  it('no timer submits, emits or advances anything', () => {
    const offenders = clientFiles.flatMap(file => {
      const source = sources.get(file)!
      return timerArguments(source)
        .filter(call => ACTING.test(reachedFrom(source, call)))
        .map(call => `${file}: ${call.slice(0, 120)}`)
    })
    expect(offenders).toEqual([])
  })

  it('client deadlines read the server clock, never the local one', () => {
    const CLOCK_READERS: Record<string, number> = {
      'lib/use-server-now.ts': 6,
      'lib/use-drag-sheet.ts': 5,
      'lib/playtest-probe.ts': 5,
      'lib/board3d/use-board-camera.ts': 4,
      'components/challenge/ZoomableImage.vue': 3,
      'lib/use-viewport.ts': 2,
      'lib/use-join-room.ts': 2,
      'lib/use-ephemeral-ticker.ts': 2,
      'lib/seat-transitions.ts': 2,
      'lib/events/client/table-notice.event.ts': 2,
      'lib/debug-rooms.ts': 2,
      'lib/use-drop-carry.ts': 2,
      'components/challenge/DragDial.vue': 2,
      'components/challenge/ChallengeTimerRadial.vue': 2,
      'lib/useGroupChallenge.ts': 1,
      'lib/events/client/player-cheering.event.ts': 1,
      'components/view/ViewSpectate.vue': 1,
      'components/challenge/FinalSunsetBlitz.vue': 1,
      'components/feedback/LeaderReveal.vue': 1,
      'components/atlas/AtlasCard.vue': 1,
      'pages/index.vue': 1,
      'components/challenge/SunsetVeil.vue': 1,
      'components/board3d/TopoScene.vue': 1,
      'components/challenge/ParliamentStage.client.vue': 2,
    }
    expect(hits(LOCAL_CLOCK, clientFiles)).toEqual(CLOCK_READERS)
  })

  it('no view arithmetic on a deadline against the local clock', () => {
    const seatStamp = '(\\.deadline|holdUntil|enteredAt|playStartsAt|nextRoundAt)'
    const clock = LOCAL_CLOCK.source
    const localDeadline = new RegExp(
      `${seatStamp}[^\\n;]*(${clock})|(${clock})[^\\n;]*${seatStamp}`
    )
    const offenders = clientFiles.filter(
      file =>
        file !== 'lib/seat-transitions.ts' && localDeadline.test(statements(sources.get(file)!))
    )
    expect(offenders).toEqual([])
  })
})

describe('the wire', () => {
  type Echoes<E extends ClientEventData['event']> =
    Extract<ClientEventData, { event: E }> extends SeatEcho ? true : false
  const SEAT_EVENTS = [
    'close-tutorial',
    'enter-movement-phase',
    'round-play',
    'round-reveal-done',
    'submit-group-challenge-answers',
    'submit-individual-challenge-answer',
    'submit-final-challenge-answer',
    'gate-reveal-done',
    'buy-hint',
    'spend-pick',
    'final-light',
  ] as const satisfies readonly ClientEventData['event'][]
  const echoes: { [E in (typeof SEAT_EVENTS)[number]]: Echoes<E> } = {
    'close-tutorial': true,
    'enter-movement-phase': true,
    'round-play': true,
    'round-reveal-done': true,
    'submit-group-challenge-answers': true,
    'submit-individual-challenge-answer': true,
    'submit-final-challenge-answer': true,
    'gate-reveal-done': true,
    'buy-hint': true,
    'spend-pick': true,
    'final-light': true,
  }

  type LegacyEcho<E extends ClientEventData['event']> = Extract<
    keyof Extract<ClientEventData, { event: E }>,
    'gateTile' | 'turn' | 'roundIndex' | 'remainingFraction'
  >
  const noLegacyEcho: {
    [E in (typeof SEAT_EVENTS)[number]]: LegacyEcho<E> extends never ? true : false
  } = {
    'close-tutorial': true,
    'enter-movement-phase': true,
    'round-play': true,
    'round-reveal-done': true,
    'submit-group-challenge-answers': true,
    'submit-individual-challenge-answer': true,
    'submit-final-challenge-answer': true,
    'gate-reveal-done': true,
    'buy-hint': true,
    'spend-pick': true,
    'final-light': true,
  }

  it('no seat event carries a gateTile, turn or roundIndex echo', () => {
    expect(Object.values(noLegacyEcho).every(Boolean)).toBe(true)
    expect(read('types/events.types.ts')).not.toMatch(/\b(gateTile|roundIndex)\b/)
  })

  it('every seat event echoes the cursor it answers', () => {
    expect(Object.keys(echoes).sort()).toEqual([...SEAT_EVENTS].sort())
  })

  it.each(SEAT_EVENTS)('the %s handler refuses any other subject', event => {
    const handler = runtimeFiles.find(file => file === `lib/events/server/${event}.handler.ts`)
    expect(handler, `no handler file for ${event}`).toBeDefined()
    expect(sources.get(handler!)).toMatch(/eventData\.subject !== (player\.)?cursor\.subject/)
  })

  it('the room is reached only through the stamping emit', () => {
    expect(
      hits(/\b(io|socket|sockets)\.(in|to|except)\([^)]*\)(?!\.(fetchSockets|disconnectSockets)\()/)
    ).toEqual({
      'lib/events/server-side.ts': 1,
    })
    expect(hits(/\bio\.(in|to)\([^)]*\)\.emit\(/)).toEqual({ 'lib/events/server-side.ts': 1 })
    expect(
      hits(
        /\.broadcast\b|\bio\.(emit|local|sockets\.emit|serverSideEmit)\(|\.of\([^)]*\)\.(emit|in|to|except)\(/
      )
    ).toEqual({})
    expect(sources.get('lib/events/server-side.ts')).toMatch(
      /\{ \.\.\.eventData, game: wireGame\(eventData\.game\) \}/
    )
    expect(sources.get('lib/events/server-side.ts')).toMatch(
      /\{ \.\.\.wire, serverNow: Date\.now\(\) \}/
    )
  })

  it('direct socket emits carry refusals and secrets, never a game', () => {
    const direct = runtimeFiles.filter(isServerFile).flatMap(file => {
      const source = sources.get(file)!
      return [...source.matchAll(/socket\.emit\(\s*([^,]+),\s*(\{[^}]*\})/g)].map(match => ({
        file,
        event: match[1]!.trim(),
        payload: match[2]!,
      }))
    })
    expect(direct.filter(({ payload }) => /\bgame\s*[:,}]/.test(payload))).toEqual([])
  })
})
