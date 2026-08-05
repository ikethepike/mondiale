import { afterEach, describe, expect, it } from 'vitest'
import { beginDrain, enqueueGameTask, gameQueueCount, resetDrainForTests } from './server-side'

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
