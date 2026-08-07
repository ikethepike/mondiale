import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gateLeapSteps, gatePot } from '~~/lib/scoring'
import type { Game, PlayerMove, Tile } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { enterMovementPhaseHandler } from './enter-movement-phase.handler'
import { startWalk } from './moves'
import { submitIndividualChallengeAnswersHandler } from './submit-individual-challenge-answer.handler'

/**
 * Regression cover for the `milk-major-pot` incident: a failed gate must leave
 * a visible, durable trace (the `blocked` turn record) and settle the pawn at
 * gate − 1 — and the stale-timer hardening around it (walk generations, the
 * gate-tile echo) must reject everything that could walk a pawn it shouldn't.
 */

const tile = (position: number, type: Tile['type'] = 'normal'): Tile => ({ position, type })

const gateMove = (position: number, variant = 'find'): PlayerMove => ({
  endTile: tile(position, 'flag'),
  challenge: {
    _type: 'individual-challenge',
    id: 'flag',
    country: 'FI',
    variant,
  } as PlayerMove['challenge'],
})

const seat = (id: string, overrides: Partial<Player> = {}): Player =>
  ({
    id,
    name: id,
    ready: true,
    color: '#000000',
    phase: 'group-challenge',
    moves: [],
    currentPosition: 0,
    ...overrides,
  }) as unknown as Player

const buildGame = (players: { [id: string]: Player }): Game =>
  ({
    id: 'test-game',
    host: 'a',
    variant: 'world',
    difficulty: 'hard',
    tiles: Array.from({ length: 12 }, (_, index) =>
      index === 5 || index === 8 ? tile(index, 'flag') : tile(index)
    ),
    players,
    rounds: [
      {
        groupChallenge: { _type: 'group-challenge' },
        groupAnswers: {},
        playerTurns: { a: { points: { scored: 6, maximum: 21 } } },
      },
    ],
  }) as unknown as Game

/** An in-memory redis + a no-op io: enough for save/emit/fetch. */
const store = new Map<string, Game>()

const context = (game: Game) => {
  store.set(game.id, game)
  return {
    io: { in: () => ({ emit: () => undefined }) },
    redis: {
      get: async (key: string) => store.get(key),
      set: async (key: string, value: Game) => void store.set(key, value),
      expire: async () => 1,
    },
    socket: {},
  } as never as { io: never; redis: never; socket: never }
}

const playerOf = (gameId: string, playerId: string) => store.get(gameId)!.players[playerId]

beforeEach(() => {
  vi.useFakeTimers()
  store.clear()
})

afterEach(() => vi.useRealTimers())

describe('a failed gate blocks the walk', () => {
  const failedGame = () =>
    buildGame({
      // Standing at gate − 1 with the gate move at the head and a second gate
      // chunk banked behind it — the forfeit must count all of it.
      a: seat('a', {
        phase: 'individual-challenge',
        currentPosition: 4,
        moves: [gateMove(5), gateMove(8)],
      }),
      // A second, round-bound seat keeps the table unsettled so the handler
      // never stages a new round (which would deal real challenges).
      b: seat('b'),
    })

  it('records the block, forfeits every banked step, and settles at gate − 1', async () => {
    const game = failedGame()
    const ctx = context(game)

    await submitIndividualChallengeAnswersHandler({
      ...ctx,
      eventKey: 'submit-individual-challenge-answer',
      eventData: { event: 'submit-individual-challenge-answer', isoCode: 'NO', gateTile: 5 },
      eventTarget: { gameId: game.id, playerId: 'a' },
    } as never)

    const blocked = store.get(game.id)!.rounds[0].playerTurns.a.blocked
    expect(blocked).toEqual({ atTile: 5, forfeitedSteps: 4 })
    expect(playerOf(game.id, 'a').moves).toEqual([])
    expect(playerOf(game.id, 'a').currentPosition).toBe(4)

    // The 5s result beat settles the seat where it stands — never past the gate.
    await vi.advanceTimersByTimeAsync(5100)
    expect(playerOf(game.id, 'a').phase).toBe('movement-summary')
    expect(playerOf(game.id, 'a').currentPosition).toBe(4)
    expect(playerOf(game.id, 'a').resolving).toBe(false)

    // A replayed duplicate of the failed answer finds a settled seat and dies.
    await submitIndividualChallengeAnswersHandler({
      ...ctx,
      eventKey: 'submit-individual-challenge-answer',
      eventData: { event: 'submit-individual-challenge-answer', isoCode: 'NO', gateTile: 5 },
      eventTarget: { gameId: game.id, playerId: 'a' },
    } as never)
    expect(playerOf(game.id, 'a').phase).toBe('movement-summary')
    expect(playerOf(game.id, 'a').currentPosition).toBe(4)
  })

  it('leaves no block on a correct answer and leaps the gate', async () => {
    const game = failedGame()
    const ctx = context(game)

    await submitIndividualChallengeAnswersHandler({
      ...ctx,
      eventKey: 'submit-individual-challenge-answer',
      eventData: {
        event: 'submit-individual-challenge-answer',
        isoCode: 'FI',
        remainingFraction: 1,
        gateTile: 5,
      },
      eventTarget: { gameId: game.id, playerId: 'a' },
    } as never)

    expect(store.get(game.id)!.rounds[0].playerTurns.a.blocked).toBeUndefined()
    expect(playerOf(game.id, 'a').currentPosition).toBe(4 + gateLeapSteps(1, 0, gatePot('find')))
    expect(playerOf(game.id, 'a').moves).toHaveLength(1)
  })

  /**
   * The precondition behind the gate shell's beat fallback (use-gate-challenge):
   * a deep-pot leap can cover the whole walk to the NEXT gate, and then the
   * result beat settles the seat straight back into 'individual-challenge'
   * with no 'moving' step in between. Nothing on the wire changes phase, so a
   * client that ends its result beat by unmounting would never end it.
   */
  it('re-enters the next gate with no walk when the leap covers it', async () => {
    const game = buildGame({
      // Rosetta's pot is 4 and the gates are three tiles apart: a full-clock
      // win lands the pawn ON gate 8, past its stop tile at 7.
      a: seat('a', {
        phase: 'individual-challenge',
        currentPosition: 4,
        moves: [gateMove(5, 'rosetta'), gateMove(8)],
      }),
      b: seat('b'),
    })
    const ctx = context(game)

    await submitIndividualChallengeAnswersHandler({
      ...ctx,
      eventKey: 'submit-individual-challenge-answer',
      eventData: {
        event: 'submit-individual-challenge-answer',
        isoCode: 'FI',
        remainingFraction: 1,
        gateTile: 5,
      },
      eventTarget: { gameId: game.id, playerId: 'a' },
    } as never)
    expect(playerOf(game.id, 'a').currentPosition).toBe(4 + gateLeapSteps(1, 0, gatePot('rosetta')))

    const phases: string[] = []
    for (let elapsed = 0; elapsed < 8000; elapsed += 250) {
      await vi.advanceTimersByTimeAsync(250)
      phases.push(playerOf(game.id, 'a').phase)
    }

    // Parked on the next gate, and the seat was never 'moving' on the way —
    // the phase the client renders from never changed at all.
    expect(playerOf(game.id, 'a').phase).toBe('individual-challenge')
    expect(playerOf(game.id, 'a').moves[0].endTile.position).toBe(8)
    expect(phases).not.toContain('moving')
  })

  it('rejects a submit whose gate-tile echo no longer matches the head gate', async () => {
    const game = failedGame()
    const ctx = context(game)

    // An ack redelivery for a PREVIOUS gate arriving while gate 5 is the head.
    await submitIndividualChallengeAnswersHandler({
      ...ctx,
      eventKey: 'submit-individual-challenge-answer',
      eventData: { event: 'submit-individual-challenge-answer', isoCode: 'NO', gateTile: 8 },
      eventTarget: { gameId: game.id, playerId: 'a' },
    } as never)

    expect(playerOf(game.id, 'a').moves).toHaveLength(2)
    expect(playerOf(game.id, 'a').resolving).toBeUndefined()
    expect(store.get(game.id)!.rounds[0].playerTurns.a.blocked).toBeUndefined()
  })
})

describe('walk generations', () => {
  it('drops a continuation armed under an older walk', async () => {
    const game = buildGame({
      a: seat('a', {
        phase: 'moving',
        currentPosition: 0,
        moves: [{ endTile: tile(3) }],
        walkSeq: 2,
      }),
      b: seat('b'),
    })
    const ctx = context(game)

    await enterMovementPhaseHandler({
      ...ctx,
      eventKey: 'enter-movement-phase',
      eventData: { event: 'enter-movement-phase', continuation: true, walkSeq: 1 },
      eventTarget: { gameId: game.id, playerId: 'a' },
    } as never)
    expect(playerOf(game.id, 'a').currentPosition).toBe(0)

    await enterMovementPhaseHandler({
      ...ctx,
      eventKey: 'enter-movement-phase',
      eventData: { event: 'enter-movement-phase', continuation: true, walkSeq: 2 },
      eventTarget: { gameId: game.id, playerId: 'a' },
    } as never)
    expect(playerOf(game.id, 'a').currentPosition).toBe(1)
  })

  it('opens a new generation on every fresh deal', () => {
    const player = seat('a')
    startWalk(player, [{ endTile: tile(3) }])
    expect(player.walkSeq).toBe(1)
    startWalk(player, [{ endTile: tile(6) }])
    expect(player.walkSeq).toBe(2)
  })
})
