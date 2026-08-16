import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { armFinalQuestionCap, armGroupScoresCap, armIndividualGateCap } from './seat-exits'
import {
  WALK_LEAD_MS,
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

// Unique per test: the per-game task queue (server-side.ts) is module state
// keyed by gameId and outlives each test — a leftover chain from one test
// firing into the next test's same-id store is nondeterministic pollution.
// Against a unique id, a straggler's fresh fetch finds nothing and dies.
let gameSeq = 0

const buildGame = (players: Player[]): Game =>
  ({
    id: `test-game-${++gameSeq}`,
    host: players[0]?.id,
    tiles: [],
    variant: 'world',
    difficulty: 'normal',
    started: true,
    players: Object.fromEntries(players.map(entry => [entry.id, entry])),
    rounds: [
      {
        groupChallenge: {},
        groupAnswers: {},
        playerTurns: { a: { points: { scored: 0, maximum: 1 } } },
      },
    ],
  }) as unknown as Game

const store = new Map<string, Game>()
// Keyed by game id, NOT one shared list: a settle chain from an earlier test
// can be parked on a real dynamic import that fake timers cannot flush (the
// gauntlet pre-warm above narrows but cannot close this), and on a slow
// runner it completes DURING a later test — its late emits must land in its
// own game's list, never the running test's assertion.
const emittedByGame = new Map<string, string[]>()
const emittedFor = (gameId: string): string[] => {
  const list = emittedByGame.get(gameId) ?? []
  emittedByGame.set(gameId, list)
  return list
}

const context = (game: Game): EngineContext => {
  store.set(game.id, game)
  return {
    io: { in: () => ({ emit: (event: string) => emittedFor(game.id).push(event) }) },
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
  emittedByGame.clear()
})

afterEach(() => vi.useRealTimers())

describe('armGroupScoresCap', () => {
  it('walks a seat still parked on its scorecard', async () => {
    const parked = seat('a', 'group-scores')
    const game = buildGame([parked])
    armGroupScoresCap(context(game), parked)

    // The cap announces the walk first — 'moving' rides a snapshot so the
    // board mounts — and the steps only start after the mount grace.
    await vi.advanceTimersByTimeAsync(GROUP_SCORES_CAP_MS + 100)
    await vi.runAllTicks()
    expect(store.get(game.id)!.players.a.phase).toBe('moving')

    await vi.advanceTimersByTimeAsync(WALK_LEAD_MS + 100)
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

    expect(emittedFor(game.id)).toEqual([])
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
    expect(emittedFor(game.id)).toContain('individual-challenge-checked')
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
    expect(emittedFor(game.id)).toContain('final-challenge-checked')
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

/**
 * The restart-recovery sweep: every parked shape a dead timer can leave
 * behind must be revivable by ANY player's rejoin — the audit found three
 * that weren't (a mid-walk seat, the gate-forfeit hold, the knockout hold).
 */
describe('rearmSeatExits', () => {
  const walkMove = (to: number) =>
    ({ endTile: { position: to } }) as unknown as Player['moves'][number]

  it('revives a dead mid-walk seat without the walker rejoining', async () => {
    const walker = seat('a', 'moving', { moves: [walkMove(2)], walkSeq: 4 })
    const bystander = seat('b', 'group-challenge')
    const game = buildGame([walker, bystander])
    const { rearmSeatExits } = await import('./seat-exits')
    rearmSeatExits(context(game), game)

    // Resume lead, two steps, arrival.
    await vi.advanceTimersByTimeAsync(10_000)
    await vi.runAllTicks()

    const fresh = store.get(game.id)!
    expect(fresh.players.a.currentPosition).toBe(2)
    expect(fresh.players.a.phase).toBe('movement-summary')
  })

  it('walks a gate-cap forfeit whose result hold died (moves empty, no latch)', async () => {
    const forfeited = seat('a', 'individual-challenge', { moves: [], walkSeq: 2 })
    const bystander = seat('b', 'group-challenge')
    const game = buildGame([forfeited, bystander])
    const { rearmSeatExits } = await import('./seat-exits')
    rearmSeatExits(context(game), game)

    await vi.advanceTimersByTimeAsync(10_000)
    await vi.runAllTicks()

    expect(store.get(game.id)!.players.a.phase).toBe('movement-summary')
  })

  it('settles a gauntlet knockout whose verdict hold died', async () => {
    const knocked = seat('a', 'final-challenge', { moves: [], resolving: true, walkSeq: 2 })
    const bystander = seat('b', 'group-challenge')
    const game = buildGame([knocked, bystander])
    const { rearmSeatExits } = await import('./seat-exits')
    rearmSeatExits(context(game), game)

    await vi.advanceTimersByTimeAsync(10_000)
    await vi.runAllTicks()

    const fresh = store.get(game.id)!
    expect(fresh.players.a.phase).toBe('movement-summary')
    expect(fresh.players.a.resolving).toBe(false)
  })

  it('never ejects a live gauntlet: an intact seat only re-arms its cap', async () => {
    const climbing = seat('a', 'final-challenge', {
      moves: [
        {
          endTile: { position: 9 },
          challenge: { _type: 'final-challenge', challenges: [{}], lives: 1 },
        } as unknown as Player['moves'][number],
      ],
    })
    const bystander = seat('b', 'group-challenge')
    const game = buildGame([climbing, bystander])
    const { rearmSeatExits } = await import('./seat-exits')
    rearmSeatExits(context(game), game)

    // Well past every hold, but short of the 90s question cap.
    await vi.advanceTimersByTimeAsync(30_000)
    await vi.runAllTicks()

    expect(store.get(game.id)!.players.a.phase).toBe('final-challenge')
  })
})
