import { afterEach, describe, expect, it } from 'vitest'
import type { Game } from '~~/types/game.types'
import {
  beginDrain,
  enqueueGameTask,
  gameQueueCount,
  resetDrainForTests,
  useServerSideEvents,
} from './server-side'

const nextTick = () => new Promise(resolve => setTimeout(resolve, 0))

describe('enqueueGameTask', () => {
  afterEach(() => {
    resetDrainForTests()
  })

  it('serializes tasks for the same game', async () => {
    const order: number[] = []
    const first = enqueueGameTask('serial-game', async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
      order.push(1)
    })
    const second = enqueueGameTask('serial-game', async () => {
      order.push(2)
    })
    await Promise.all([first, second])
    expect(order).toEqual([1, 2])
  })

  it('prunes a settled queue so the map tracks live games only', async () => {
    await enqueueGameTask('prune-game', () => 'done')
    await nextTick()
    expect(gameQueueCount()).toBe(0)
  })

  it('refuses new tasks while draining', async () => {
    beginDrain()
    await expect(enqueueGameTask('drain-game', () => 'never')).rejects.toThrow('Draining')
  })
})

describe('updateGameState revision stamp', () => {
  const server = (store: Map<string, unknown>) =>
    useServerSideEvents({
      redis: {
        set: async (key: string, value: unknown) => void store.set(key, value),
        get: async (key: string) => store.get(key),
        expire: async () => 1,
      } as never,
      socket: {} as never,
      io: {} as never,
    })

  it('stamps 1 on a rev-less game and increments on every save', async () => {
    const store = new Map<string, unknown>()
    const game = { id: 'rev-game' } as never as Game
    await server(store).updateGameState(game)
    expect(game.rev).toBe(1)
    await server(store).updateGameState(game)
    expect(game.rev).toBe(2)
    expect((store.get('rev-game') as Game).rev).toBe(2)
  })
})
