import { afterEach, describe, expect, it, vi } from 'vitest'
import { enqueueGameTask, resetDrainForTests, type GameServer } from '../server-side'
import { drainForShutdown } from './graceful-shutdown'
import { claimGameOwnership, ownerKey } from './game-ownership'
import { asRedis, fakeRedis, type FakeRedis } from './fake-redis'

const fakeIo = (gameIds: string[]) => {
  const sockets = new Map(gameIds.map((gameId, index) => [`socket-${index}`, { data: { gameId } }]))
  return {
    of: () => ({ sockets }),
    disconnectSockets: vi.fn(),
    close: vi.fn(),
  }
}

/** Record every lease release the drain performs, in arrival order. */
const recordReleases = (redis: FakeRedis, events: string[]) => {
  const originalEval = redis.eval.bind(redis)
  redis.eval = async (script, keys, args) => {
    events.push('release')
    return originalEval(script, keys, args)
  }
}

describe('drainForShutdown', () => {
  afterEach(() => {
    resetDrainForTests()
    vi.unstubAllEnvs()
  })

  it('settles in-flight writes BEFORE releasing the leases', async () => {
    vi.stubEnv('FLY_MACHINE_ID', 'machine-a')
    const redis = fakeRedis()
    await claimGameOwnership(asRedis(redis), 'game-1', 'machine-a')

    const events: string[] = []
    recordReleases(redis, events)

    // A write already past its lease check when the drain begins — the lease
    // must not move until this lands, or another machine could be clobbered.
    const inFlight = enqueueGameTask('game-1', async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
      events.push('write')
    })

    const io = fakeIo(['game-1'])
    await drainForShutdown({ io: io as unknown as GameServer, redis: asRedis(redis) })

    expect(events).toEqual(['write', 'release'])
    expect(io.disconnectSockets).toHaveBeenCalledWith(true)
    expect(io.close).toHaveBeenCalledOnce()
    expect(redis.store.has(ownerKey('game-1'))).toBe(false)
    await inFlight
  })

  it('skips the release when the settle cap trips — TTL heals, clobbers never', async () => {
    vi.stubEnv('FLY_MACHINE_ID', 'machine-a')
    const redis = fakeRedis()
    await claimGameOwnership(asRedis(redis), 'game-2', 'machine-a')

    const events: string[] = []
    recordReleases(redis, events)

    const slow = enqueueGameTask('game-2', async () => {
      await new Promise(resolve => setTimeout(resolve, 200))
    })

    const io = fakeIo(['game-2'])
    await drainForShutdown({
      io: io as unknown as GameServer,
      redis: asRedis(redis),
      settleCapMs: 20,
    })

    expect(events).toEqual([])
    expect(redis.store.get(ownerKey('game-2'))).toBe('machine-a')
    expect(io.close).toHaveBeenCalledOnce()
    await slow
  })

  it('refuses new game tasks once the drain has begun', async () => {
    const redis = fakeRedis()
    const io = fakeIo([])
    await drainForShutdown({ io: io as unknown as GameServer, redis: asRedis(redis) })
    await expect(enqueueGameTask('game-3', () => 'never')).rejects.toThrow('Draining')
  })
})
