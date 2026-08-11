import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applySweepClaim,
  applySweepReady,
  currentCleanSweep,
  rearmCleanSweep,
  scheduleSweepTimeout,
} from './sweep-beats'
import {
  BRIEFING_CAP_MS,
  FIRST_TURN_GRACE_MS,
  REVEAL_HOLD_MS,
  SWEEP_LOCKOUT_MS,
  TIMEOUT_SLACK_MS,
} from '~~/lib/round-beats'
import { SWEEP_STRAY_CAP } from '~~/lib/clean-sweep'
import type { CleanSweepChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { Player, PlayerPhase } from '~~/types/player.type'
import type { EngineContext } from './round-engine'

/**
 * Clean Sweep's engine, on the same fake-timer rig as its siblings. The
 * behaviours worth pinning are the ones the mode is BUILT on: the race two
 * seats can enter for one slot, the bench a wrong name buys, and the fact that
 * every follow-up survives losing its in-process timer.
 */

const MEMBERS = ['FR', 'DE', 'IT'] as CleanSweepChallenge['members']

const challengeFixture = (
  overrides: Partial<CleanSweepChallenge['state']> = {}
): CleanSweepChallenge => ({
  _type: 'clean-sweep-challenge',
  setId: 'eu',
  members: [...MEMBERS],
  durationSeconds: 80,
  maximumPoints: 20,
  state: {
    briefing: true,
    ready: [],
    deadline: 0,
    order: ['ada', 'ben'],
    claims: [],
    strays: [],
    benched: {},
    ...overrides,
  },
})

const seat = (id: string, phase: PlayerPhase = 'group-challenge'): Player =>
  ({ id, name: id, phase, moves: [], currentPosition: 0 }) as unknown as Player

const buildGame = (challenge: CleanSweepChallenge): Game =>
  ({
    id: 'test-game',
    host: 'ada',
    tiles: [],
    variant: 'world',
    difficulty: 'normal',
    started: true,
    players: { ada: seat('ada'), ben: seat('ben') },
    rounds: [{ groupChallenge: challenge, groupAnswers: {}, playerTurns: {} }],
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
    eventTarget: { gameId: game.id, playerId: 'ada' },
  } as unknown as EngineContext
}

const liveSweep = (gameId: string): CleanSweepChallenge => currentCleanSweep(store.get(gameId)!)!

/** A briefed board with the clock running. */
const openBoard = () => {
  const challenge = challengeFixture({
    briefing: false,
    ready: ['ada', 'ben'],
    deadline: Date.now() + 80_000,
  })
  const game = buildGame(challenge)
  return { challenge, game, ctx: context(game) }
}

beforeEach(() => {
  vi.useFakeTimers()
  store.clear()
  emitted.length = 0
})

afterEach(() => vi.useRealTimers())

describe('the briefing gate', () => {
  it('starts the board only once the whole table is ready', async () => {
    const challenge = challengeFixture()
    const game = buildGame(challenge)
    const ctx = context(game)

    await applySweepReady(ctx, game, challenge, 'ada')
    expect(challenge.state.briefing).toBe(true)
    expect(challenge.state.deadline).toBe(0)

    await applySweepReady(ctx, game, challenge, 'ben')
    expect(challenge.state.briefing).toBe(false)
    expect(challenge.state.deadline).toBe(Date.now() + 80_000 + FIRST_TURN_GRACE_MS)
  })

  it('ignores a repeat ready and a seat that is not at the table', async () => {
    const challenge = challengeFixture()
    const game = buildGame(challenge)
    const ctx = context(game)

    await applySweepReady(ctx, game, challenge, 'ada')
    await applySweepReady(ctx, game, challenge, 'ada')
    await applySweepReady(ctx, game, challenge, 'watcher')
    expect(challenge.state.ready).toEqual(['ada'])
    expect(challenge.state.briefing).toBe(true)
  })

  it('force-starts a table that never all clicks', async () => {
    const challenge = challengeFixture()
    const game = buildGame(challenge)
    const ctx = context(game)

    scheduleSweepTimeout(ctx, game, challenge)
    await vi.advanceTimersByTimeAsync(BRIEFING_CAP_MS + 50)
    await vi.runAllTicks()

    expect(liveSweep(game.id).state.briefing).toBe(false)
  })
})

describe('claiming a slot', () => {
  it('gives the slot to the seat whose mutation ran first', async () => {
    const { challenge, game, ctx } = openBoard()

    await applySweepClaim(ctx, game, challenge, 'ada', 'FR')
    // Ben names the same country a beat later — the queue already ran Ada's.
    await applySweepClaim(ctx, game, challenge, 'ben', 'FR')

    expect(challenge.state.claims.map(entry => entry.playerId)).toEqual(['ada'])
    expect(challenge.state.benched.ben).toBeUndefined()
  })

  it('stamps the clock left on each claim rather than trusting it later', async () => {
    const { challenge, game, ctx } = openBoard()
    await applySweepClaim(ctx, game, challenge, 'ada', 'FR')
    expect(challenge.state.claims[0].remaining).toBeCloseTo(1, 1)

    await vi.advanceTimersByTimeAsync(40_000)
    await applySweepClaim(ctx, game, challenge, 'ben', 'DE')
    expect(challenge.state.claims[1].remaining).toBeCloseTo(0.5, 1)
  })

  it('benches a wrong name and records the stray', async () => {
    const { challenge, game, ctx } = openBoard()
    await applySweepClaim(ctx, game, challenge, 'ada', 'NO')

    expect(challenge.state.claims).toHaveLength(0)
    expect(challenge.state.strays).toEqual([{ isoCode: 'NO', playerId: 'ada' }])
    expect(challenge.state.benched.ada).toBe(Date.now() + SWEEP_LOCKOUT_MS)
  })

  it('refuses a benched seat, and lets it back in when the stamp lapses', async () => {
    const { challenge, game, ctx } = openBoard()
    await applySweepClaim(ctx, game, challenge, 'ada', 'NO')

    await applySweepClaim(ctx, game, challenge, 'ada', 'FR')
    expect(challenge.state.claims).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(SWEEP_LOCKOUT_MS + 10)
    await applySweepClaim(ctx, game, challenge, 'ada', 'FR')
    expect(challenge.state.claims.map(entry => entry.isoCode)).toEqual(['FR'])
  })

  it('never lets the stray log grow without bound', async () => {
    const { challenge, game, ctx } = openBoard()
    for (let attempt = 0; attempt < SWEEP_STRAY_CAP + 5; attempt++) {
      // Step past each bench so every miss is a real, accepted attempt.
      await vi.advanceTimersByTimeAsync(SWEEP_LOCKOUT_MS + 10)
      await applySweepClaim(ctx, game, challenge, 'ada', 'NO')
    }
    expect(challenge.state.strays.length).toBe(SWEEP_STRAY_CAP)
  })

  it('ignores claims from outside the round, and while the briefing holds', async () => {
    const briefing = challengeFixture()
    const briefingGame = buildGame(briefing)
    await applySweepClaim(context(briefingGame), briefingGame, briefing, 'ada', 'FR')
    expect(briefing.state.claims).toHaveLength(0)

    const { challenge, game, ctx } = openBoard()
    await applySweepClaim(ctx, game, challenge, 'watcher', 'FR')
    expect(challenge.state.claims).toHaveLength(0)
  })
})

describe('resolving the board', () => {
  it('finishes early the moment the last slot goes', async () => {
    const { challenge, game, ctx } = openBoard()
    await applySweepClaim(ctx, game, challenge, 'ada', 'FR')
    await applySweepClaim(ctx, game, challenge, 'ben', 'DE')
    expect(challenge.state.finished).toBeUndefined()

    await applySweepClaim(ctx, game, challenge, 'ada', 'IT')
    expect(liveSweep(game.id).state.finished).toBe(true)
  })

  it('banks the table after the reveal hold, with each seat’s own claims', async () => {
    const { challenge, game, ctx } = openBoard()
    await applySweepClaim(ctx, game, challenge, 'ada', 'FR')
    await applySweepClaim(ctx, game, challenge, 'ben', 'DE')
    await applySweepClaim(ctx, game, challenge, 'ada', 'IT')

    await vi.advanceTimersByTimeAsync(REVEAL_HOLD_MS + 50)
    await vi.runAllTicks()

    const round = store.get(game.id)!.rounds[0]
    expect(round.groupAnswers.ada).toEqual({ submitted: ['FR', 'IT'], correct: [...MEMBERS] })
    expect(round.groupAnswers.ben).toEqual({ submitted: ['DE'], correct: [...MEMBERS] })
    // A swept board pays every seat, so nobody walks away with nothing.
    expect(round.playerTurns.ada.points.scored).toBeGreaterThan(0)
    expect(round.playerTurns.ben.points.scored).toBeGreaterThan(0)
    expect(store.get(game.id)!.players.ada.phase).toBe('group-scores')
  })

  it('resolves a board the clock ran out on', async () => {
    const { challenge, game, ctx } = openBoard()
    await applySweepClaim(ctx, game, challenge, 'ada', 'FR')
    scheduleSweepTimeout(ctx, game, challenge)

    await vi.advanceTimersByTimeAsync(80_000 + TIMEOUT_SLACK_MS + 50)
    await vi.runAllTicks()

    const resolved = liveSweep(game.id)
    expect(resolved.state.finished).toBe(true)
    // Two slots stood — the sweep bonus is off, so Ben's zero is a real zero.
    await vi.advanceTimersByTimeAsync(REVEAL_HOLD_MS + 50)
    await vi.runAllTicks()
    expect(store.get(game.id)!.rounds[0].playerTurns.ben.points.scored).toBe(0)
  })
})

describe('surviving a lost timer', () => {
  it('re-arms the briefing cap', async () => {
    const challenge = challengeFixture()
    const game = buildGame(challenge)
    const ctx = context(game)

    rearmCleanSweep(ctx, game)
    await vi.advanceTimersByTimeAsync(BRIEFING_CAP_MS + 50)
    await vi.runAllTicks()
    expect(liveSweep(game.id).state.briefing).toBe(false)
  })

  it('leaves the briefing alone while round-1 rules cards are still up', async () => {
    const challenge = challengeFixture()
    const game = buildGame(challenge)
    const ctx = context(game)

    rearmCleanSweep(ctx, game, { armBriefingCaps: false })
    await vi.advanceTimersByTimeAsync(BRIEFING_CAP_MS + 50)
    await vi.runAllTicks()
    expect(liveSweep(game.id).state.briefing).toBe(true)
  })

  it('settles a board that finished but never banked', async () => {
    const { challenge, game, ctx } = openBoard()
    challenge.state.claims.push({ isoCode: 'FR', playerId: 'ada', at: Date.now(), remaining: 0.5 })
    challenge.state.finished = true

    rearmCleanSweep(ctx, game)
    await vi.advanceTimersByTimeAsync(REVEAL_HOLD_MS + 50)
    await vi.runAllTicks()

    expect(store.get(game.id)!.rounds[0].playerTurns.ada).toBeDefined()
  })

  it('never re-banks a round that already settled', async () => {
    const { challenge, game, ctx } = openBoard()
    challenge.state.finished = true
    const round = game.rounds[0]
    round.groupAnswers.ada = { submitted: ['FR'], correct: [...MEMBERS] }
    round.playerTurns.ada = { points: { scored: 9, maximum: 20 } }

    rearmCleanSweep(ctx, game)
    await vi.advanceTimersByTimeAsync(REVEAL_HOLD_MS + 50)
    await vi.runAllTicks()

    expect(store.get(game.id)!.rounds[0].playerTurns.ada.points.scored).toBe(9)
  })
})
