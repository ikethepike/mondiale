import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Redis } from '@upstash/redis'
import {
  claimGameOwnership,
  machineOwnsGame,
  ownerKey,
  releaseGameOwnership,
} from './game-ownership'

/** In-memory stand-in for the four commands the lease uses. `eval` mirrors
 *  the RELEASE_SCRIPT's compare-and-delete semantics. */
const fakeRedis = () => {
  const store = new Map<string, string>()
  return {
    store,
    async set(key: string, value: string, opts?: { nx?: boolean }) {
      if (opts?.nx && store.has(key)) return null
      store.set(key, value)
      return 'OK'
    },
    async get(key: string) {
      return store.get(key) ?? null
    },
    async expire(key: string) {
      return store.has(key) ? 1 : 0
    },
    async eval(_script: string, keys: string[], args: string[]) {
      if (store.get(keys[0]) === args[0]) {
        store.delete(keys[0])
        return 1
      }
      return 0
    },
  }
}

const asRedis = (fake: ReturnType<typeof fakeRedis>) => fake as unknown as Redis

describe('claimGameOwnership', () => {
  it('claims an unowned game for the caller', async () => {
    const redis = fakeRedis()
    await expect(claimGameOwnership(asRedis(redis), 'game-1', 'machine-a')).resolves.toBe(
      'machine-a'
    )
    expect(redis.store.get(ownerKey('game-1'))).toBe('machine-a')
  })

  it('reports the standing owner instead of stealing the lease', async () => {
    const redis = fakeRedis()
    await claimGameOwnership(asRedis(redis), 'game-1', 'machine-a')
    await expect(claimGameOwnership(asRedis(redis), 'game-1', 'machine-b')).resolves.toBe(
      'machine-a'
    )
    expect(redis.store.get(ownerKey('game-1'))).toBe('machine-a')
  })

  it('confirms and keeps an own lease on re-claim (the heartbeat path)', async () => {
    const redis = fakeRedis()
    await claimGameOwnership(asRedis(redis), 'game-1', 'machine-a')
    await expect(claimGameOwnership(asRedis(redis), 'game-1', 'machine-a')).resolves.toBe(
      'machine-a'
    )
    expect(redis.store.get(ownerKey('game-1'))).toBe('machine-a')
  })

  it('scopes leases per game', async () => {
    const redis = fakeRedis()
    await claimGameOwnership(asRedis(redis), 'game-1', 'machine-a')
    await expect(claimGameOwnership(asRedis(redis), 'game-2', 'machine-b')).resolves.toBe(
      'machine-b'
    )
  })
})

describe('releaseGameOwnership', () => {
  it('releases an own lease', async () => {
    const redis = fakeRedis()
    await claimGameOwnership(asRedis(redis), 'game-1', 'machine-a')
    await releaseGameOwnership(asRedis(redis), 'game-1', 'machine-a')
    expect(redis.store.has(ownerKey('game-1'))).toBe(false)
  })

  it("never wipes another machine's lease (slow shutdown vs fresh claim)", async () => {
    const redis = fakeRedis()
    await claimGameOwnership(asRedis(redis), 'game-1', 'machine-b')
    await releaseGameOwnership(asRedis(redis), 'game-1', 'machine-a')
    expect(redis.store.get(ownerKey('game-1'))).toBe('machine-b')
  })
})

describe('machineOwnsGame', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('always passes when unsharded (no FLY_MACHINE_ID)', async () => {
    vi.stubEnv('FLY_MACHINE_ID', '')
    const redis = fakeRedis()
    await expect(machineOwnsGame(asRedis(redis), 'game-1')).resolves.toBe(true)
    expect(redis.store.size).toBe(0)
  })

  it('re-claims a lapsed lease for the firing machine', async () => {
    vi.stubEnv('FLY_MACHINE_ID', 'machine-a')
    const redis = fakeRedis()
    await expect(machineOwnsGame(asRedis(redis), 'game-1')).resolves.toBe(true)
    expect(redis.store.get(ownerKey('game-1'))).toBe('machine-a')
  })

  it('refuses when the room moved to another machine', async () => {
    vi.stubEnv('FLY_MACHINE_ID', 'machine-a')
    const redis = fakeRedis()
    await claimGameOwnership(asRedis(redis), 'game-1', 'machine-b')
    await expect(machineOwnsGame(asRedis(redis), 'game-1')).resolves.toBe(false)
  })
})
