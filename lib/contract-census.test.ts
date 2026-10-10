import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { ClientEventData, SeatEcho } from '~~/types/events.types'

/**
 * The seat-cursor contract (#174), pinned as source scrapes: one writer, no
 * legacy staleness tokens, every server wait owned by a named home, every
 * client timer reviewed, and every seat event echoing the cursor it answers.
 * A count drifting here is a review, not a typo — update the census only
 * after reading the new code against the contract.
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
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')
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

describe('single writer', () => {
  it('only the transition table, the legacy migration and the lobby seat assign a cursor', () => {
    expect(hits(/\.cursor\s*=(?!=)/)).toEqual({
      'lib/seat-transitions.ts': 1,
      'lib/events/server/seat-migrate.ts': 1,
    })
    expect(hits(/\bcursor:\s*initialSeatCursor\(/)).toEqual({ 'lib/player.ts': 1 })
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
    /\b(setTimeout|setInterval|scheduleGameTask|scheduleEngineTask|scheduleDeadlineTask|scheduleRevealTask)\(/
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
      count: 23,
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
    'components/GameMap.vue': { count: 5, category: 'cosmetic' },
    'components/challenge/ChallengeTimerRadial.vue': { count: 4, category: 'cosmetic' },
    'components/challenge/AudioFieldGl.client.vue': { count: 3, category: 'cosmetic' },
    'lib/useGroupChallenge.ts': { count: 3, category: 'cosmetic' },
    'lib/useOutlineReveal.ts': { count: 2, category: 'cosmetic' },
    'lib/use-viewport.ts': { count: 2, category: 'local-input' },
    'lib/use-map-viewbox.ts': { count: 2, category: 'cosmetic' },
    'lib/events/client-side.ts': { count: 2, category: 'transport' },
    'components/view/ViewPyramidScheme.vue': { count: 2, category: 'cosmetic' },
    'components/map/ContourBackdropGl.client.vue': { count: 2, category: 'cosmetic' },
    'components/challenge/ZoomableImage.vue': { count: 2, category: 'cosmetic' },
    'components/challenge/FinalChangeFrames.vue': { count: 2, category: 'cosmetic' },
    'components/challenge/AudioDock.vue': { count: 2, category: 'local-input' },
    'components/KeyboardLab.client.vue': { count: 2, category: 'cosmetic' },
    'plugins/socket.client.ts': { count: 1, category: 'transport' },
    'lib/use-server-now.ts': { count: 1, category: 'server-clock' },
    'lib/use-lockout-beat.ts': { count: 1, category: 'local-input' },
    'lib/use-intro-beat.ts': { count: 1, category: 'cosmetic' },
    'lib/use-ephemeral-ticker.ts': { count: 1, category: 'cosmetic' },
    'lib/use-drag-sheet.ts': { count: 1, category: 'local-input' },
    'lib/use-bottom-sheet.ts': { count: 1, category: 'local-input' },
    'lib/time.ts': { count: 1, category: 'transport' },
    'lib/board3d/use-pawn-movement.ts': { count: 1, category: 'cosmetic' },
    'lib/board3d/use-board-camera.ts': { count: 1, category: 'local-input' },
    'components/view/ViewVictory.vue': { count: 1, category: 'cosmetic' },
    'components/view/ViewTrendRace.vue': { count: 1, category: 'cosmetic' },
    'components/view/ViewTerraIncognita.vue': { count: 1, category: 'cosmetic' },
    'components/view/ViewPlayerConfiguration.vue': { count: 1, category: 'cosmetic' },
    'components/view/ViewManhunt.vue': { count: 1, category: 'local-input' },
    'components/view/ViewFinalChallenge.vue': { count: 1, category: 'cosmetic' },
    'components/view/ViewAnthemBuzz.vue': { count: 1, category: 'cosmetic' },
    'components/spectate/SpectateBar.vue': { count: 1, category: 'local-input' },
    'components/player/PlayerStatusPanel.vue': { count: 1, category: 'local-input' },
    'components/map/MapInset.vue': { count: 1, category: 'cosmetic' },
    'components/feedback/SourceInfo.vue': { count: 1, category: 'cosmetic' },
    'components/feedback/ReconnectToast.vue': { count: 1, category: 'cosmetic' },
    'components/challenge/individual/GateTrendDuel.vue': { count: 1, category: 'local-input' },
    'components/challenge/individual/GateAtlas.vue': { count: 1, category: 'cosmetic' },
    'components/challenge/TimelineScorecard.vue': { count: 1, category: 'cosmetic' },
    'components/challenge/SunsetVeil.vue': { count: 1, category: 'cosmetic' },
    'components/challenge/FinalSunsetBlitz.vue': { count: 1, category: 'cosmetic' },
    'components/challenge/FinalScales.vue': { count: 1, category: 'cosmetic' },
    'components/challenge/DragDial.vue': { count: 1, category: 'local-input' },
    'components/board3d/TopoScene.vue': { count: 1, category: 'cosmetic' },
    'components/board3d/BoardStage.client.vue': { count: 1, category: 'cosmetic' },
  }
  const TIMER = /\b(setTimeout|setInterval|requestAnimationFrame)\(/
  const clientFiles = runtimeFiles.filter(file => !isServerFile(file))

  it('every client timer is reviewed and counted', () => {
    expect(hits(TIMER, clientFiles)).toEqual(
      Object.fromEntries(Object.entries(CLIENT_TIMERS).map(([file, { count }]) => [file, count]))
    )
  })

  /** The callback text of every timer call — the balanced argument list. */
  const timerArguments = (source: string) => {
    const calls: string[] = []
    for (const match of source.matchAll(new RegExp(TIMER, 'g'))) {
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

  it('no timer submits, emits or advances anything', () => {
    const acting =
      /\b(update|submitOnce|submit[A-Z]\w*|submitAnswer|advance\w*|enterMovement\w*|closeTutorial)\(|socket\.emit\(|\bemit\('(submit|answer|continue|done)/
    const offenders = clientFiles.flatMap(file =>
      timerArguments(sources.get(file)!)
        .filter(call => acting.test(call))
        .map(call => `${file}: ${call.slice(0, 120)}`)
    )
    expect(offenders).toEqual([])
  })

  it('client deadlines read the server clock, never the local one', () => {
    const CLOCK_READERS: Record<string, number> = {
      'lib/use-server-now.ts': 6,
      'lib/use-drag-sheet.ts': 6,
      'lib/playtest-probe.ts': 5,
      'lib/board3d/use-board-camera.ts': 4,
      'components/challenge/ZoomableImage.vue': 3,
      'lib/use-viewport.ts': 2,
      'lib/use-join-room.ts': 2,
      'lib/use-ephemeral-ticker.ts': 2,
      'lib/seat-transitions.ts': 2,
      'lib/events/client/table-notice.event.ts': 2,
      'lib/debug-rooms.ts': 2,
      'components/view/ViewPyramidScheme.vue': 2,
      'components/challenge/FinalSunsetBlitz.vue': 2,
      'components/challenge/DragDial.vue': 2,
      'components/challenge/ChallengeTimerRadial.vue': 2,
      'lib/useGroupChallenge.ts': 1,
      'lib/events/client/player-cheering.event.ts': 1,
      'components/view/ViewSpectate.vue': 1,
      'components/challenge/SunsetVeil.vue': 1,
      'components/board3d/TopoScene.vue': 1,
    }
    expect(hits(/\b(Date|performance)\.now\(\)/, clientFiles)).toEqual(CLOCK_READERS)
  })

  it('no view arithmetic on a deadline against the local clock', () => {
    const seatStamp = '(\\.deadline|holdUntil|enteredAt|playStartsAt|nextRoundAt)'
    const localDeadline = new RegExp(
      `${seatStamp}[^\\n;]*\\b(Date|performance)\\.now\\(\\)|\\b(Date|performance)\\.now\\(\\)[^\\n;]*${seatStamp}`
    )
    expect(
      Object.keys(hits(localDeadline, clientFiles)).filter(
        file => file !== 'lib/seat-transitions.ts'
      )
    ).toEqual([])
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
    expect(hits(/\bio\.(in|to)\([^)]*\)\.emit\(/)).toEqual({ 'lib/events/server-side.ts': 1 })
    expect(sources.get('lib/events/server-side.ts')).toMatch(
      /\{ \.\.\.eventData, serverNow: Date\.now\(\) \}/
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
