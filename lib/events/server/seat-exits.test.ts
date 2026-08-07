import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  armFinalQuestionCap,
  armGroupScoresCap,
  armIndividualGateCap,
} from './seat-exits'
import {
  FINAL_QUESTION_CAP_MS,
  GROUP_SCORES_CAP_MS,
  INDIVIDUAL_GATE_CAP_MS,
} from '~~/lib/round-beats'
import type { Game } from '~~/types/game.types'
import type { Player, PlayerPhase } from '~~/types/player.type'
import type { EngineContext } from './round-engine'
// Pre-warm the gauntlet's deferred module: applyFinalMiss imports it
// dynamically, and under fake timers a cold module load never resolves
// before the assertions run.
import '~~/lib/challenges/final-challenge'

/**
 * The parked-seat caps: each fires through a fresh fetch and must die on its
 * staleness token — a cap that walks a seat a client is already driving is
 * the double-stepper bug, and one that fires across a consumed question
 * burns a miss the player never owed.
 */

const seat = (id: string, phase: PlayerPhase, extra: Partial<Player> = {}): Player =>
  ({
    id,
    name: id,
    phase,
    moves: [],
    currentPosition: 0,
    walkSeq: 1,
    ...extra,
  }) as unknown as Player

const buildGame = (players: Player[]): Game =>
  ({
    id: 'test-game',
    host: players[0]?.id,
    tiles: [],
    variant: 'world',
    difficulty: 'normal',
    started: true,
    players: Object.fromEntries(players.map(entry => [entry.id, entry])),
    rounds: [{ groupChallenge: {}, groupAnswers: {}, playerTurns: { a: { points: { scored: 0, maximum: 1 } } } }],
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

beforeEach(() => {
  vi.useFakeTimers()
  store.clear()
  emitted.length = 0
})

afterEach(() => vi.useRealTimers())

describe('armGroupScoresCap', () => {
  it('walks a seat still parked on its scorecard', async () => {
    const parked = seat('a', 'group-scores')
    const game = buildGame([parked])
    armGroupScoresCap(context(game), parked)

    await vi.advanceTimersByTimeAsync(GROUP_SCORES_CAP_MS + 100)
    await vi.runAllTicks()

    // Nothing left to walk → the movement re-entry settles the seat.
    expect(store.get(game.id)!.players.a.phase).toBe('movement-summary')
  })

  it('dies when the walk generation moved on', async () => {
    const parked = seat('a', 'group-scores')
    const game = buildGame([parked])
    armGroupScoresCap(context(game), parked)

    // The client closed scores and a NEW walk started before the cap fired.
    store.get(game.id)!.players.a.walkSeq = 2
    await vi.advanceTimersByTimeAsync(GROUP_SCORES_CAP_MS + 100)
    await vi.runAllTicks()

    expect(store.get(game.id)!.players.a.phase).toBe('group-scores')
  })

  it('never touches a seat that already walked', async () => {
    const parked = seat('a', 'group-scores')
    const game = buildGame([parked])
    armGroupScoresCap(context(game), parked)

    store.get(game.id)!.players.a.phase = 'movement-summary'
    store.get(game.id)!.players.a.moves = []
    await vi.advanceTimersByTimeAsync(GROUP_SCORES_CAP_MS + 100)
    await vi.runAllTicks()

    expect(emitted).toEqual([])
  })
})

describe('armIndividualGateCap', () => {
  const gateMove = () =>
    ({
      endTile: { position: 5 },
      challenge: { _type: 'individual-challenge', variant: 'flag' },
    }) as unknown as Player['moves'][number]

  it('forfeits an unanswered gate through the blocked record', async () => {
    const blocked = seat('a', 'individual-challenge', { moves: [gateMove()], walkSeq: 3 })
    const game = buildGame([blocked])
    armIndividualGateCap(context(game), blocked)

    await vi.advanceTimersByTimeAsync(INDIVIDUAL_GATE_CAP_MS + 100)
    await vi.runAllTicks()

    const fresh = store.get(game.id)!
    expect(fresh.players.a.moves).toEqual([])
    expect(fresh.rounds[0].playerTurns.a.blocked).toEqual({ atTile: 5, forfeitedSteps: 5 })
    expect(emitted).toContain('individual-challenge-checked')
  })

  it('leaves a gate whose answer is mid-flight alone', async () => {
    const answering = seat('a', 'individual-challenge', {
      moves: [gateMove()],
      resolving: true,
    })
    const game = buildGame([answering])
    armIndividualGateCap(context(game), answering)

    await vi.advanceTimersByTimeAsync(INDIVIDUAL_GATE_CAP_MS + 100)
    await vi.runAllTicks()

    expect(store.get(game.id)!.players.a.moves).toHaveLength(1)
  })
})

describe('armFinalQuestionCap', () => {
  const gauntletMove = (turn: number) =>
    ({
      endTile: { position: 9 },
      challenge: {
        _type: 'final-challenge',
        turn,
        lives: 1,
        totalCount: 3,
        answeredCorrect: 1,
        challenges: [{ _type: 'region-challenge' }, { _type: 'max-challenge' }],
      },
    }) as unknown as Player['moves'][number]

  it('burns a miss for an unanswered question', async () => {
    const stalled = seat('a', 'final-challenge', { moves: [gauntletMove(2)] })
    const game = buildGame([stalled])
    armFinalQuestionCap(context(game), stalled)

    await vi.advanceTimersByTimeAsync(FINAL_QUESTION_CAP_MS + 100)
    await vi.runAllTicks()

    const gauntlet = store.get(game.id)!.players.a.moves[0]!.challenge
    expect(gauntlet).toMatchObject({ turn: 3, lives: 0 })
    expect((gauntlet as { challenges: unknown[] }).challenges).toHaveLength(1)
    expect(emitted).toContain('final-challenge-checked')
  })

  it('dies on the turn token once the question was answered', async () => {
    const live = seat('a', 'final-challenge', { moves: [gauntletMove(2)] })
    const game = buildGame([live])
    armFinalQuestionCap(context(game), live)

    // The player answered: the handler bumped the turn before the cap fired.
    const gauntlet = store.get(game.id)!.players.a.moves[0]!.challenge as { turn: number }
    gauntlet.turn = 3

    await vi.advanceTimersByTimeAsync(FINAL_QUESTION_CAP_MS + 100)
    await vi.runAllTicks()

    expect((store.get(game.id)!.players.a.moves[0]!.challenge as { lives: number }).lives).toBe(1)
  })
})
