import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyChainMove, currentBorderChain, rearmBorderChain } from './chain-turns'
import { submitChainMoveHandler } from './submit-chain-move.handler'
import { REVEAL_HOLD_MS, TIMEOUT_SLACK_MS, TRAP_HOLD_MS } from './turn-timing'
import type { BorderChainChallenge, BorderChainState } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import type { EngineContext } from './round-engine'

/**
 * The dead-end trap: the one elimination nobody sees coming, because the
 * trapped player never holds the clock. The engine must hold the whole table
 * on the proof before it deals fresh ground — so these assert the two halves
 * separately: what the pause commits, and what the hold's follow-up does.
 */

/** Fresh every call — the engine mutates these arrays in place. */
const trapState = (): BorderChainState => ({
  ready: [],
  // Portugal's only connection is Spain. Whoever inherits this head is trapped.
  chains: [['ES']],
  order: ['a', 'b', 'c'],
  activeIndex: 0,
  turn: 1,
  deadline: 0,
  named: {},
  strikesLeft: {},
  eliminated: [],
  outcomes: {},
  missedOuts: {},
})

const seat = (id: string): Player =>
  ({
    id,
    name: id,
    ready: true,
    color: 'blue',
    phase: 'group-challenge',
    moves: [],
    currentPosition: 0,
  }) as unknown as Player

const buildGame = (stateOverrides: Partial<BorderChainState> = {}): Game => {
  const challenge: BorderChainChallenge = {
    _type: 'border-chain-challenge',
    turnSeconds: 12,
    maximumPoints: 15,
    strikes: 0,
    // Hard keeps micro-nations in play, so the border graph is the full one.
    state: { ...trapState(), ...stateOverrides },
  }
  return {
    id: 'test-game',
    host: 'a',
    tiles: [],
    variant: 'world',
    difficulty: 'hard',
    players: { a: seat('a'), b: seat('b'), c: seat('c') },
    rounds: [{ groupChallenge: challenge, groupAnswers: {}, playerTurns: {} }],
  } as unknown as Game
}

/** An in-memory redis + a no-op io: enough for the engine's save/emit/fetch. */
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
    eventTarget: { gameId: game.id },
  } as unknown as EngineContext
}

const chainOf = (gameId: string) => currentBorderChain(store.get(gameId)!)!

beforeEach(() => {
  vi.useFakeTimers()
  store.clear()
  emitted.length = 0
})

afterEach(() => vi.useRealTimers())

/** Let the hold elapse and drain the queue the follow-up re-enters. */
const elapseHold = async () => {
  await vi.advanceTimersByTimeAsync(TRAP_HOLD_MS + TIMEOUT_SLACK_MS + 10)
  await vi.runAllTicks()
}

describe('applyChainMove — the dead-end trap', () => {
  it('holds the table on the proof instead of dealing straight past it', async () => {
    const game = buildGame()
    const ctx = context(game)

    // 'a' walks Spain → Portugal, leaving 'b' a head with no way out.
    await applyChainMove(ctx, game, currentBorderChain(game)!, 'PT')

    const { state } = chainOf(game.id)
    expect(state.trap).toBeDefined()
    expect(state.trap!.playerId).toBe('b')
    expect(state.trap!.head).toBe('PT')
    expect(state.trap!.byPlayerId).toBe('a')
    // The whole point: the fresh chain has NOT been dealt yet.
    expect(state.chains).toEqual([['ES', 'PT']])
    // Nobody is on the clock during the hold.
    expect(state.deadline).toBe(0)
    expect(emitted).toEqual(['chain-updated'])
  })

  it('carries the closed doors as the proof, captured while the head is live', async () => {
    const game = buildGame()
    const ctx = context(game)
    await applyChainMove(ctx, game, currentBorderChain(game)!, 'PT')

    const doors = chainOf(game.id).state.trap!.doors
    expect(doors).toEqual([{ isoCode: 'ES', reason: 'walked', step: 1 }])
  })

  it('eliminates the trapped player with the durable reveal record', async () => {
    const game = buildGame()
    const ctx = context(game)
    await applyChainMove(ctx, game, currentBorderChain(game)!, 'PT')

    const { state } = chainOf(game.id)
    expect(state.eliminated).toEqual(['b'])
    expect(state.outcomes.b).toBe('trapped')
    expect(state.trappedBy).toEqual({ b: 'a' })
    // No outs to teach — the reveal's doors section correctly stays empty.
    expect(state.missedOuts.b).toEqual([])
  })

  it('deals fresh ground and passes the clock once the hold elapses', async () => {
    const game = buildGame()
    const ctx = context(game)
    await applyChainMove(ctx, game, currentBorderChain(game)!, 'PT')

    const heldTurn = chainOf(game.id).state.turn
    await elapseHold()

    const { state } = chainOf(game.id)
    expect(state.trap).toBeUndefined()
    expect(state.chains).toHaveLength(2)
    // Fresh ground is never a country already walked.
    expect(state.chains[1]).toHaveLength(1)
    expect(['ES', 'PT']).not.toContain(state.chains[1][0])
    expect(state.turn).toBeGreaterThan(heldTurn)
    // The trapped seat never gets the clock back.
    expect(state.order[state.activeIndex]).not.toBe('b')
    expect(state.deadline).toBeGreaterThan(0)
  })

  it('does not deal fresh ground before the hold has elapsed', async () => {
    const game = buildGame()
    const ctx = context(game)
    await applyChainMove(ctx, game, currentBorderChain(game)!, 'PT')

    await vi.advanceTimersByTimeAsync(TRAP_HOLD_MS - 500)
    expect(chainOf(game.id).state.trap).toBeDefined()
    expect(chainOf(game.id).state.chains).toHaveLength(1)
  })

  it('credits no trapper when a player walks into their own dead end', async () => {
    // Two seats: 'a' moves, the turn comes back around to 'a' itself.
    const game = buildGame({ order: ['a'], activeIndex: 0 })
    const ctx = context(game)
    await applyChainMove(ctx, game, currentBorderChain(game)!, 'PT')

    const { state } = chainOf(game.id)
    expect(state.trap!.playerId).toBe('a')
    expect(state.trap!.byPlayerId).toBeUndefined()
    expect(state.trappedBy).toBeUndefined()
  })

  it('still holds on the proof when the trap ends the round', async () => {
    // Only 'a' and 'b' stand; trapping 'b' leaves one player.
    const game = buildGame({ order: ['a', 'b'], activeIndex: 0 })
    const ctx = context(game)
    await applyChainMove(ctx, game, currentBorderChain(game)!, 'PT')

    // The round-ending trap is the one most worth showing: pause first.
    const held = chainOf(game.id).state
    expect(held.trap).toBeDefined()
    expect(held.finished).toBeFalsy()

    await elapseHold()

    const { state } = chainOf(game.id)
    expect(state.trap).toBeUndefined()
    expect(state.finished).toBe(true)
    expect(state.outcomes.a).toBe('won')
  })

  it('ignores a stale hold whose turn has already moved on', async () => {
    const game = buildGame()
    const ctx = context(game)
    await applyChainMove(ctx, game, currentBorderChain(game)!, 'PT')

    // Something else advanced the round while the timer was in flight.
    const live = store.get(game.id)!
    currentBorderChain(live)!.state.turn += 5

    await elapseHold()
    // The stale follow-up must not deal a chain on top of the new state.
    expect(chainOf(game.id).state.chains).toHaveLength(1)
  })
})

describe('applyChainMove — the ordinary move', () => {
  it('extends the chain and passes the clock without a trap', async () => {
    const game = buildGame({ chains: [['DE']] })
    const ctx = context(game)
    await applyChainMove(ctx, game, currentBorderChain(game)!, 'FR')

    const { state } = chainOf(game.id)
    expect(state.trap).toBeUndefined()
    expect(state.chains).toEqual([['DE', 'FR']])
    expect(state.named.a).toEqual(['FR'])
    expect(state.lastMoverId).toBe('a')
    expect(state.order[state.activeIndex]).toBe('b')
    expect(state.eliminated).toEqual([])
  })
})

/** A persisted dead-end hold, as a fresh process would find it: the trapped
 *  seat still reads as active with a matching turn token, and no timer exists
 *  anywhere. */
const heldTrap = (): Partial<BorderChainState> => ({
  chains: [['ES', 'PT']],
  activeIndex: 1,
  turn: 2,
  deadline: 0,
  eliminated: ['b'],
  outcomes: { b: 'trapped' },
  missedOuts: { b: [] },
  lastMoverId: 'a',
  trap: { playerId: 'b', head: 'PT', byPlayerId: 'a', doors: [] },
})

describe('submitChainMoveHandler — the dead-end hold', () => {
  // Regression: without the trap guard, this submit passed every check
  // (active player, matching turn), resolved as a miss, and advanced the
  // turn — staling the hold's follow-up while scheduleChainTimeout refuses
  // to arm during a trap. Permanent freeze, and a double elimination.
  it('rejects a submit from the trapped seat during the hold', async () => {
    const game = buildGame(heldTrap())
    const ctx = context(game)

    await submitChainMoveHandler({
      ...ctx,
      eventKey: 'submit-chain-move',
      eventData: { event: 'submit-chain-move', turn: 2, isoCode: 'FR' },
      eventTarget: { gameId: game.id, playerId: 'b' },
    })

    const { state } = chainOf(game.id)
    expect(state.turn).toBe(2)
    expect(state.trap).toBeDefined()
    expect(state.eliminated).toEqual(['b'])
  })
})

describe('rearmBorderChain — rejoin recovery', () => {
  it('revives a dead trap hold and deals fresh ground', async () => {
    const game = buildGame(heldTrap())
    const ctx = context(game)

    rearmBorderChain(ctx, game)
    await elapseHold()

    const { state } = chainOf(game.id)
    expect(state.trap).toBeUndefined()
    expect(state.chains).toHaveLength(2)
    expect(state.deadline).toBeGreaterThan(0)
  })

  it('settles a finished round whose reveal hold died before banking', async () => {
    const game = buildGame({
      chains: [['ES', 'PT']],
      eliminated: ['b', 'c'],
      outcomes: { a: 'won', b: 'trapped', c: 'timeout' },
      finished: true,
    })
    const ctx = context(game)

    rearmBorderChain(ctx, game)
    await vi.advanceTimersByTimeAsync(REVEAL_HOLD_MS + 10)
    await vi.runAllTicks()

    const fresh = store.get(game.id)!
    const round = fresh.rounds[0]
    expect(Object.keys(round.groupAnswers)).toHaveLength(3)
    expect(round.playerTurns.a).toBeDefined()
    for (const id of ['a', 'b', 'c']) {
      expect(fresh.players[id].phase).toBe('group-scores')
    }
  })

  it('does not settle a round twice', async () => {
    const game = buildGame({ finished: true, outcomes: { a: 'won' } })
    // Scoring already marked the round — the latch every settle task checks.
    game.rounds[0].groupAnswers = { a: { submitted: [], correct: [] } }
    game.players.a.phase = 'movement-summary'
    const ctx = context(game)

    rearmBorderChain(ctx, game)
    await vi.advanceTimersByTimeAsync(REVEAL_HOLD_MS + 10)
    await vi.runAllTicks()

    const fresh = store.get(game.id)!
    expect(Object.keys(fresh.rounds[0].groupAnswers)).toEqual(['a'])
    expect(fresh.players.a.phase).toBe('movement-summary')
  })
})
