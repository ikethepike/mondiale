import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyAtlasMove, currentAtlasChain } from './atlas-turns'
import { pullRipCordHandler } from './pull-rip-cord.handler'
import { atlasTurnSeconds } from '~~/lib/atlas-chain'
import { TIMEOUT_SLACK_MS, TRAP_HOLD_MS } from '~~/lib/round-beats'
import type { AtlasChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { EngineContext } from './round-engine'
import { dropArmedTimersForTests } from './seat-cursor'
import { testSeat } from './test-seat'

/**
 * The rip cord: a voluntary swap on your own clock, and the cushion that
 * fires by itself when a dead end would knock its holder out.
 */

/** Mali → Iraq leaves 'b' a head whose one opener, Q, is already walked. */
const atlasState = (overrides: Partial<AtlasChallenge['state']> = {}): AtlasChallenge['state'] => ({
  ready: [],
  chains: [['QA'], ['ML']],
  order: ['a', 'b', 'c'],
  activeIndex: 0,
  turn: 1,
  deadline: 0,
  named: {},
  strikesLeft: {},
  ripCords: { a: 1, b: 0, c: 1 },
  breaks: [{ kind: 'rip-cord', playerId: 'c' }],
  eliminated: [],
  outcomes: {},
  missedOuts: {},
  ...overrides,
})

const buildGame = (overrides: Partial<AtlasChallenge['state']> = {}): Game => {
  const challenge: AtlasChallenge = {
    _type: 'atlas-challenge',
    turnSeconds: 18,
    turnFloorSeconds: 11,
    maximumPoints: 15,
    strikes: 0,
    state: atlasState(overrides),
  }
  return {
    id: 'atlas-game',
    host: 'a',
    tiles: [],
    regions: [],
    difficulty: 'hard',
    players: { a: testSeat('a'), b: testSeat('b'), c: testSeat('c') },
    rounds: [{ groupChallenge: challenge, groupAnswers: {}, playerTurns: {} }],
  } as unknown as Game
}

const store = new Map<string, Game>()

const context = (game: Game): EngineContext => {
  store.set(game.id, game)
  return {
    io: { in: () => ({ emit: () => undefined }) },
    redis: {
      get: async (key: string) => store.get(key),
      set: async (key: string, value: Game) => void store.set(key, value),
      expire: async () => 1,
    },
    socket: {},
    eventTarget: { gameId: game.id },
  } as unknown as EngineContext
}

const atlasOf = (gameId: string) => currentAtlasChain(store.get(gameId)!)!

const pull = (game: Game, playerId: string, turn: number) =>
  pullRipCordHandler({
    ...context(game),
    eventKey: 'pull-rip-cord',
    eventData: { event: 'pull-rip-cord', turn },
    eventTarget: { gameId: game.id, playerId },
  })

const elapseHold = async () => {
  await vi.advanceTimersByTimeAsync(TRAP_HOLD_MS + TIMEOUT_SLACK_MS + 10)
  await vi.runAllTicks()
}

beforeEach(() => {
  vi.useFakeTimers()
  dropArmedTimersForTests()
  store.clear()
})

afterEach(() => vi.useRealTimers())

describe('pull-rip-cord', () => {
  it('swaps the live chain for fresh ground and keeps the clock', async () => {
    const game = buildGame()
    await pull(game, 'a', 1)

    const { state } = atlasOf(game.id)
    expect(state.chains).toHaveLength(3)
    expect(state.chains[2]).toHaveLength(1)
    expect(['QA', 'ML']).not.toContain(state.chains[2][0])
    expect(state.ripCords?.a).toBe(0)
    expect(state.breaks?.at(-1)).toEqual({ kind: 'rip-cord', playerId: 'a' })
    expect(state.order[state.activeIndex]).toBe('a')
    expect(state.turn).toBe(2)
    expect(state.deadline).toBe(Date.now() + atlasTurnSeconds(atlasOf(game.id)) * 1000)
  })

  it('refuses a seat off the clock, a stale turn and a spent cord', async () => {
    const game = buildGame({ ripCords: { a: 0, b: 1, c: 1 } })
    await pull(game, 'b', 1)
    await pull(game, 'a', 0)
    await pull(game, 'a', 1)

    const { state } = atlasOf(game.id)
    expect(state.chains).toHaveLength(2)
    expect(state.turn).toBe(1)
  })
})

describe('the dead end', () => {
  it('knocks out a seat with no cord and pays the sealer', async () => {
    const game = buildGame()
    const ctx = context(game)
    await applyAtlasMove(ctx, game, currentAtlasChain(game)!, 'IQ')

    const { state } = atlasOf(game.id)
    expect(state.trap).toMatchObject({ playerId: 'b', openers: ['q'], spent: ['QA'] })
    expect(state.eliminated).toEqual(['b'])
    expect(state.trappedBy).toEqual({ b: 'a' })
    expect(state.breaks?.at(-1)).toEqual({
      kind: 'trap',
      playerId: 'b',
      byPlayerId: 'a',
      rescued: false,
    })
  })

  it('spends a held cord instead, and the saved seat plays the fresh chain', async () => {
    const game = buildGame({ ripCords: { a: 1, b: 1, c: 1 } })
    const ctx = context(game)
    await applyAtlasMove(ctx, game, currentAtlasChain(game)!, 'IQ')

    const held = atlasOf(game.id).state
    expect(held.trap?.playerId).toBe('b')
    expect(held.eliminated).toEqual([])
    expect(held.trappedBy).toBeUndefined()
    expect(held.ripCords?.b).toBe(0)

    await elapseHold()

    const { state } = atlasOf(game.id)
    expect(state.trap).toBeUndefined()
    expect(state.chains).toHaveLength(3)
    expect(state.order[state.activeIndex]).toBe('b')
    expect(state.deadline).toBeGreaterThan(0)
  })
})
