import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleTimelineRevealDone, rearmTimeline } from './timeline-turns'
import { GATE_BROWSE_CAP_MS, TIMELINE_BROWSE_CAP_MS, TIMEOUT_SLACK_MS } from '~~/lib/round-beats'
import { seatSubject } from '~~/lib/seat-transitions'
import type { TimelineChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import type { SeatStep } from '~~/types/seat.types'
import type { ChainContext } from './chain-turns'
import { dropArmedTimersForTests } from './seat-cursor'
import { createTestTable, type TestTable } from './test-table'
import { testCursor, testSeat } from './test-seat'

/**
 * The player-paced reveal exits: timeline's table settle (all-acked or the
 * browse cap), and the browsable verdicts' early Continue — a gate's and a
 * round's — which only ever end the browsable verdict on the echoed subject.
 */

const seat = (id: string, step: SeatStep, extra: Partial<Player> = {}): Player =>
  testSeat(id, step, extra)

let gameSeq = 0

const timelineChallenge = (
  revealDone: string[] | undefined,
  order = ['a', 'b']
): TimelineChallenge =>
  ({
    _type: 'timeline-challenge',
    turnSeconds: 22,
    revealSeconds: 7,
    maximumPoints: 20,
    state: {
      deck: ['fall-of-the-berlin-wall', 'battle-of-marathon'],
      placed: ['fall-of-the-berlin-wall', 'battle-of-marathon'],
      card: 2,
      order,
      activeIndex: 0,
      turn: 2,
      deadline: Date.now() + TIMELINE_BROWSE_CAP_MS,
      placements: [],
      finished: true,
      ...(revealDone ? { revealDone } : {}),
    },
  }) as unknown as TimelineChallenge

const buildGame = (players: Player[], challenge: unknown): Game =>
  ({
    id: `reveal-game-${++gameSeq}`,
    host: players[0]?.id,
    tiles: [],
    variant: 'world',
    difficulty: 'normal',
    started: true,
    players: Object.fromEntries(players.map(entry => [entry.id, entry])),
    rounds: [{ groupChallenge: challenge, groupAnswers: {}, playerTurns: {} }],
  }) as unknown as Game

const store = new Map<string, Game>()
const emitted: { event: string; gameId: string }[] = []

const context = (game: Game, playerId = 'a'): ChainContext => {
  store.set(game.id, game)
  return {
    io: {
      in: () => ({
        emit: (event: string) => emitted.push({ event, gameId: game.id }),
      }),
    },
    redis: {
      get: async (key: string) => store.get(key),
      set: async (key: string, value: Game) => void store.set(key, value),
      expire: async () => 1,
    },
    socket: {},
    eventTarget: { gameId: game.id, playerId },
  } as unknown as ChainContext
}

const settled = (game: Game) => Object.keys(game.rounds[0].groupAnswers).length > 0

beforeEach(() => {
  vi.useFakeTimers()
  store.clear()
  emitted.length = 0
})

afterEach(() => vi.useRealTimers())

describe('handleTimelineRevealDone', () => {
  it('collects acks idempotently and ignores non-participants', async () => {
    const game = buildGame([seat('a', 'round'), seat('b', 'round')], timelineChallenge([]))
    const ctx = context(game)

    await handleTimelineRevealDone(ctx, game, 'a')
    await handleTimelineRevealDone(ctx, game, 'a')
    await handleTimelineRevealDone(ctx, game, 'watcher')

    const fresh = store.get(game.id)!
    const challenge = fresh.rounds[0].groupChallenge as TimelineChallenge
    expect(challenge.state.revealDone).toEqual(['a'])
    expect(settled(fresh)).toBe(false)
  })

  it('settles the table the moment every seat has read on', async () => {
    const game = buildGame([seat('a', 'round'), seat('b', 'round')], timelineChallenge([]))
    const ctx = context(game)

    await handleTimelineRevealDone(ctx, game, 'a')
    await handleTimelineRevealDone(ctx, store.get(game.id)!, 'b')
    await vi.runAllTicks()

    expect(settled(store.get(game.id)!)).toBe(true)
  })

  it('tolerates a round dealt before revealDone existed', async () => {
    const game = buildGame([seat('a', 'round')], timelineChallenge(undefined, ['a']))
    const ctx = context(game)

    await handleTimelineRevealDone(ctx, game, 'a')
    await vi.runAllTicks()

    // The lone seat's ack IS the whole table — straight to settle.
    expect(settled(store.get(game.id)!)).toBe(true)
  })

  it('drops an ack that lands after the settle marked the round', async () => {
    const game = buildGame([seat('a', 'round'), seat('b', 'round')], timelineChallenge(['a', 'b']))
    game.rounds[0].groupAnswers = { a: {} } as never
    const ctx = context(game)

    await handleTimelineRevealDone(ctx, game, 'b')

    const challenge = store.get(game.id)?.rounds[0].groupChallenge as TimelineChallenge | undefined
    // Nothing saved: the handler bailed before touching state.
    expect(challenge ?? null).not.toBeNull()
    expect(emitted.filter(entry => entry.gameId === game.id)).toEqual([])
  })

  it('settles a partially-read table when the browse cap fires', async () => {
    const game = buildGame([seat('a', 'round'), seat('b', 'round')], timelineChallenge(['a']))
    const ctx = context(game)

    // The rearm path arms the cap against the persisted deadline.
    rearmTimeline(ctx, game)
    await vi.advanceTimersByTimeAsync(TIMELINE_BROWSE_CAP_MS + TIMEOUT_SLACK_MS + 100)
    await vi.runAllTicks()

    expect(settled(store.get(game.id)!)).toBe(true)
  })
})

const browsableVerdict = (browsable: boolean) =>
  testSeat('a', 'gate-verdict', {
    currentPosition: 4,
    moves: [
      {
        endTile: { position: 5, type: 'flag' },
        challenge: {
          _type: 'individual-challenge',
          id: 'flag',
          country: 'FI',
          variant: 'chronicle',
        },
      } as Player['moves'][number],
      { endTile: { position: 9, type: 'normal' } },
    ],
    cursor: testCursor('gate-verdict', {
      subject: seatSubject.gate(1, 5),
      holdUntil: Date.now() + GATE_BROWSE_CAP_MS,
      verdict: {
        kind: 'gate',
        subject: seatSubject.gate(1, 5),
        correct: true,
        timedOut: false,
        steps: 2,
        browsable,
      },
    }),
  })

const tableOf = async (players: Player[], challenge: unknown = { _type: 'round' }) => {
  const table = await createTestTable(buildGame(players, challenge))
  tables.push(table)
  return table
}
let tables: TestTable[] = []
afterEach(() => {
  dropArmedTimersForTests()
  for (const table of tables) table.dispose()
  tables = []
})

describe('gateRevealDoneHandler', () => {
  const done = async (table: TestTable, subject = seatSubject.gate(1, 5)) =>
    table.send('a', { event: 'gate-reveal-done', subject, seq: 2 })

  it('ends a browsable verdict early and walks on', async () => {
    const table = await tableOf([browsableVerdict(true), testSeat('b', 'round')])
    await done(table)
    const fresh = (await table.read()).players.a!
    expect(fresh.cursor).toMatchObject({ step: 'walk', cause: 'event:gate-reveal-done' })
    expect(fresh.currentPosition).toBe(6)
  })

  it('refuses a verdict that is not browsable', async () => {
    const table = await tableOf([browsableVerdict(false), testSeat('b', 'round')])
    await done(table)
    expect((await table.read()).players.a!.cursor.step).toBe('gate-verdict')
  })

  it('refuses a Continue echoing another subject', async () => {
    const table = await tableOf([browsableVerdict(true), testSeat('b', 'round')])
    await done(table, seatSubject.gate(1, 8))
    expect((await table.read()).players.a!.cursor.step).toBe('gate-verdict')
  })

  it('refuses every step but a gate verdict — the gauntlet and a live question included', async () => {
    for (const step of ['gate', 'final-verdict', 'final', 'walk'] as const) {
      const table = await tableOf([testSeat('a', step), testSeat('b', 'round')])
      const before = (await table.read()).players.a!.cursor
      await done(table, before.subject)
      expect((await table.read()).players.a!.cursor, step).toEqual(before)
    }
  })
})

describe('roundRevealDoneHandler', () => {
  const TREND_RACE = { _type: 'trend-race-challenge', maximumPoints: 10 }
  const onReveal = () =>
    testSeat('a', 'round-verdict', {
      cursor: testCursor('round-verdict', {
        holdUntil: Date.now() + 60_000,
        verdict: { kind: 'round', subject: seatSubject.round(0), scored: 3, maximum: 10 },
      }),
    })

  it('ends a browsable round reveal early onto the scorecard', async () => {
    const table = await tableOf([onReveal(), testSeat('b', 'round')], TREND_RACE)
    await table.send('a', { event: 'round-reveal-done', subject: seatSubject.round(0), seq: 2 })
    expect((await table.read()).players.a!.cursor).toMatchObject({
      step: 'scores',
      cause: 'event:round-reveal-done',
    })
  })

  it('refuses a kind whose reveal is not browsable', async () => {
    const table = await tableOf([onReveal(), testSeat('b', 'round')])
    await table.send('a', { event: 'round-reveal-done', subject: seatSubject.round(0), seq: 2 })
    expect((await table.read()).players.a!.cursor.step).toBe('round-verdict')
  })
})
