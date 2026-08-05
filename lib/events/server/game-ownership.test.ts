import { afterEach, describe, expect, it, vi } from 'vitest'
import { asRedis, fakeRedis } from './fake-redis'
import {
  claimGameOwnership,
  machineOwnsGame,
  ownerKey,
  releaseGameOwnership,
} from './game-ownership'

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
