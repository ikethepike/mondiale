import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rearmClassicRound, scheduleClassicSettle, startClassicClock } from './classic-rounds'
import {
  CLASSIC_SETTLE_SLACK_MS,
  FIRST_TURN_GRACE_MS,
  PLAY_GATE_CAP_MS,
  playGateMsFor,
  revealBudgetMsFor,
  TIMEOUT_SLACK_MS,
} from '~~/lib/round-beats'
import type {
  AnthemBuzzChallenge,
  TwoTruthsChallenge,
} from '~~/types/challenges/group-modes.type'
import type { Game, Round } from '~~/types/game.types'
import type { Player, PlayerPhase } from '~~/types/player.type'
import type { EngineContext } from './round-engine'

/**
 * The classic engine's whole reason to exist: a round whose only clock used
 * to be a client interval must now settle server-side, even when every tab
 * is dead. These drive the settle task through fake timers, the same rig as
 * chain-turns.test.ts.
 */

const CHALLENGE: TwoTruthsChallenge = {
  _type: 'two-truths-challenge',
  country: 'SE',
  durationSeconds: 25,
  maximumPoints: 10,
} as TwoTruthsChallenge

/** A play-gated kind: the clip only starts on the player's own tap, so the
 *  server's window has to cover that wait as well as the 30s of anthem. */
const ANTHEM: AnthemBuzzChallenge = {
  _type: 'anthem-buzz-challenge',
  country: 'SE',
  durationSeconds: 30,
  maximumPoints: 10,
} as AnthemBuzzChallenge

const seat = (id: string, phase: PlayerPhase): Player =>
  ({
    id,
    name: id,
    phase,
    moves: [],
    currentPosition: 0,
  }) as unknown as Player

const buildGame = (
  phases: { [playerId: string]: PlayerPhase },
  challenge: TwoTruthsChallenge | AnthemBuzzChallenge = CHALLENGE
): Game =>
  ({
    id: 'test-game',
    host: 'a',
    tiles: [],
    variant: 'world',
    difficulty: 'normal',
    started: true,
    players: Object.fromEntries(Object.entries(phases).map(([id, phase]) => [id, seat(id, phase)])),
    rounds: [{ groupChallenge: { ...challenge }, groupAnswers: {}, playerTurns: {} }],
  }) as unknown as Game

const store = new Map<string, Game>()
const emitted: string[] = []

const context = (game: Game): EngineContext => {
  store.set(game.id, game)
  return {
    io: { in: () => ({ emit: (event: string) => emitted.push(event) }) },
    redis: {
      get: async (key: string) => store.get(key),
      set: async (key: string, value: Game) => void store.set(key, value),
      expire: async () => 1,
    },
    socket: {},
    eventTarget: { gameId: game.id, playerId: 'a' },
  } as unknown as EngineContext
}

const roundOf = (gameId: string): Round => store.get(gameId)!.rounds[0]

beforeEach(() => {
  vi.useFakeTimers()
  store.clear()
  emitted.length = 0
})

afterEach(() => vi.useRealTimers())

/** Let the full settle budget elapse and drain the queue it re-enters. */
const elapseSettle = async (round: Round) => {
  const fireAt = round.deadline! + revealBudgetMsFor(round.groupChallenge) + CLASSIC_SETTLE_SLACK_MS
  await vi.advanceTimersByTimeAsync(fireAt - Date.now() + TIMEOUT_SLACK_MS + 10)
  await vi.runAllTicks()
}

describe('startClassicClock', () => {
  it('stamps the play window plus the opening grace', () => {
    const game = buildGame({ a: 'group-challenge' })
    const round = game.rounds[0]
    startClassicClock(round)
    expect(round.deadline).toBe(
      Date.now() + 25_000 + playGateMsFor(round.groupChallenge) + FIRST_TURN_GRACE_MS
    )
    // An ungated kind opens its window at the reveal: no gate in the budget.
    expect(playGateMsFor(round.groupChallenge)).toBe(0)
  })

  it('leaves engine rounds to their own state clocks', () => {
    const game = buildGame({ a: 'group-challenge' })
    const round = game.rounds[0]
    round.groupChallenge = { _type: 'border-chain-challenge' } as never
    startClassicClock(round)
    expect(round.deadline).toBeUndefined()
  })
})

describe('scheduleClassicSettle', () => {
  it('banks a zero for every seat that never answered and advances the table', async () => {
    const game = buildGame({ a: 'group-scores', b: 'group-challenge' })
    const round = game.rounds[0]
    // 'a' answered and advanced normally; 'b' went dark mid-round.
    round.groupAnswers.a = { submitted: ['SE'], correct: ['SE'] }
    round.playerTurns.a = { points: { scored: 8, maximum: 10 } }
    startClassicClock(round)
    const ctx = context(game)

    scheduleClassicSettle(ctx, game)
    await elapseSettle(round)

    const settled = roundOf(game.id)
    expect(settled.groupAnswers.b).toEqual({ submitted: [], correct: ['SE'] })
    expect(settled.playerTurns.b.points).toEqual({ scored: 0, maximum: 10 })
    expect(store.get(game.id)!.players.b.phase).toBe('group-scores')
    // 'a' is untouched — no rescore, no re-walk.
    expect(settled.playerTurns.a.points).toEqual({ scored: 8, maximum: 10 })
    expect(store.get(game.id)!.players.a.phase).toBe('group-scores')
    expect(emitted).toContain('table-updated')
  })

  it('advances a stranded submitter from the banked score without rescoring', async () => {
    const game = buildGame({ b: 'group-challenge' })
    const round = game.rounds[0]
    round.groupAnswers.b = { submitted: ['SE'], correct: ['SE'] }
    round.playerTurns.b = { points: { scored: 6, maximum: 10 } }
    startClassicClock(round)
    const ctx = context(game)

    scheduleClassicSettle(ctx, game)
    await elapseSettle(round)

    expect(store.get(game.id)!.players.b.phase).toBe('group-scores')
    expect(roundOf(game.id).playerTurns.b.points).toEqual({ scored: 6, maximum: 10 })
  })

  it('never sweeps a seat that was never dealt into the round', async () => {
    // A late joiner still typing their name is walk-exempt but NOT in the
    // round — banking it a zero would hand it a scorecard for a round it
    // never saw.
    const game = buildGame({ a: 'group-scores', b: 'naming' })
    const round = game.rounds[0]
    round.groupAnswers.a = { submitted: ['SE'], correct: ['SE'] }
    startClassicClock(round)
    const ctx = context(game)

    scheduleClassicSettle(ctx, game)
    await elapseSettle(round)

    expect(roundOf(game.id).groupAnswers.b).toBeUndefined()
    expect(store.get(game.id)!.players.b.phase).toBe('naming')
  })

  it('settles nothing when every seat already advanced', async () => {
    const game = buildGame({ a: 'group-scores', b: 'movement-summary' })
    const round = game.rounds[0]
    round.groupAnswers.a = { submitted: ['SE'], correct: ['SE'] }
    startClassicClock(round)
    const ctx = context(game)

    scheduleClassicSettle(ctx, game)
    await elapseSettle(round)

    expect(roundOf(game.id).groupAnswers.b).toBeUndefined()
    expect(emitted).not.toContain('table-updated')
  })

  it('dies on the round-index token when a newer round staged', async () => {
    const game = buildGame({ b: 'group-challenge' })
    const round = game.rounds[0]
    startClassicClock(round)
    const ctx = context(game)
    scheduleClassicSettle(ctx, game)

    // A new round staged before the timer fired: the old task must not touch it.
    const fresh = store.get(game.id)!
    fresh.rounds.push({
      groupChallenge: { ...CHALLENGE },
      groupAnswers: {},
      playerTurns: {},
    } as Round)

    await elapseSettle(round)
    expect(store.get(game.id)!.players.b.phase).toBe('group-challenge')
    expect(store.get(game.id)!.rounds[1].groupAnswers).toEqual({})
  })
})

/**
 * The audio rounds' clock starts on the player's own play tap (iOS refuses
 * autoplay), so the server's window has to cover that wait as well as the
 * play — otherwise the backstop force-banks a zero on a seat still mid-clip.
 */
describe('play-gated rounds', () => {
  it('stamps the play window behind the play-tap allowance', () => {
    const game = buildGame({ a: 'group-challenge' }, ANTHEM)
    const round = game.rounds[0]
    startClassicClock(round)
    expect(round.deadline).toBe(Date.now() + 30_000 + PLAY_GATE_CAP_MS + FIRST_TURN_GRACE_MS)
  })

  it('does not bank a zero on a seat still inside the play allowance', async () => {
    const game = buildGame({ a: 'group-challenge' }, ANTHEM)
    const round = game.rounds[0]
    startClassicClock(round)
    const ctx = context(game)
    scheduleClassicSettle(ctx, game)

    // Past where an UNGATED budget would have settled — the regression this
    // whole beat exists to prevent: a player who tapped play late is still
    // legitimately listening here.
    await vi.advanceTimersByTimeAsync(
      30_000 + FIRST_TURN_GRACE_MS + revealBudgetMsFor(ANTHEM) + CLASSIC_SETTLE_SLACK_MS + 100
    )
    await vi.runAllTicks()

    expect(store.get(game.id)!.players.a.phase).toBe('group-challenge')
    expect(roundOf(game.id).groupAnswers.a).toBeUndefined()
  })

  it('still sweeps a seat that never taps play', async () => {
    const game = buildGame({ a: 'group-challenge' }, ANTHEM)
    const round = game.rounds[0]
    startClassicClock(round)
    const ctx = context(game)
    scheduleClassicSettle(ctx, game)
    await elapseSettle(round)

    // Bounded on purpose: the gate buys time, it never lets a silent seat
    // hold the table open.
    expect(store.get(game.id)!.players.a.phase).toBe('group-scores')
    expect(roundOf(game.id).playerTurns.a.points.scored).toBe(0)
    expect(emitted).toContain('table-updated')
  })
})

describe('rearmClassicRound', () => {
  it('re-arms the settle for a stamped live round', async () => {
    const game = buildGame({ b: 'group-challenge' })
    const round = game.rounds[0]
    startClassicClock(round)
    const ctx = context(game)

    // The original timer died with a restart; only the rearm survives.
    rearmClassicRound(ctx, game)
    await elapseSettle(round)

    expect(store.get(game.id)!.players.b.phase).toBe('group-scores')
  })

  it('re-stamps a revealed round that has no deadline (pre-stamp snapshot)', async () => {
    const game = buildGame({ b: 'group-challenge' })
    const ctx = context(game)

    rearmClassicRound(ctx, game)
    await vi.runAllTicks()
    await vi.advanceTimersByTimeAsync(50)

    const stamped = roundOf(game.id).deadline
    expect(stamped).toBeGreaterThan(Date.now())

    await elapseSettle(roundOf(game.id))
    expect(store.get(game.id)!.players.b.phase).toBe('group-scores')
  })

  it('never arms a staged-but-unrevealed round', async () => {
    const game = buildGame({ b: 'movement-summary' })
    game.pendingRoundStart = true
    const ctx = context(game)

    rearmClassicRound(ctx, game)
    await vi.advanceTimersByTimeAsync(600_000)

    expect(roundOf(game.id).deadline).toBeUndefined()
    expect(store.get(game.id)!.players.b.phase).toBe('movement-summary')
  })
})
