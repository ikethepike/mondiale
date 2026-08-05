import { afterEach, describe, expect, it, vi } from 'vitest'
import { scheduleGameTask } from './deferred-task'
import { claimGameOwnership, ownerKey } from './game-ownership'
import { asRedis, fakeRedis } from './fake-redis'

describe('scheduleGameTask (the timer→queue seam)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('runs the task after the delay when unsharded (no FLY_MACHINE_ID)', async () => {
    vi.stubEnv('FLY_MACHINE_ID', '')
    vi.useFakeTimers()
    const redis = fakeRedis()
    const ran = vi.fn()

    scheduleGameTask({ redis: asRedis(redis), gameId: 'game-a' }, 500, ran)
    await vi.advanceTimersByTimeAsync(499)
    expect(ran).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(ran).toHaveBeenCalledOnce()
    // Unsharded never touches the lease space
    expect(redis.store.size).toBe(0)
  })

  it("drops a fired timer when another machine holds the game's lease", async () => {
    vi.stubEnv('FLY_MACHINE_ID', 'machine-a')
    vi.useFakeTimers()
    const redis = fakeRedis()
    await claimGameOwnership(asRedis(redis), 'game-b', 'machine-b')
    const ran = vi.fn()

    scheduleGameTask({ redis: asRedis(redis), gameId: 'game-b' }, 100, ran)
    await vi.advanceTimersByTimeAsync(100)
    expect(ran).not.toHaveBeenCalled()
    // ...and the standing lease is untouched
    expect(redis.store.get(ownerKey('game-b'))).toBe('machine-b')
  })

  it('re-claims a lapsed lease for the firing machine and runs', async () => {
    vi.stubEnv('FLY_MACHINE_ID', 'machine-a')
    vi.useFakeTimers()
    const redis = fakeRedis()
    const ran = vi.fn()

    scheduleGameTask({ redis: asRedis(redis), gameId: 'game-c' }, 100, ran)
    await vi.advanceTimersByTimeAsync(100)
    expect(ran).toHaveBeenCalledOnce()
    expect(redis.store.get(ownerKey('game-c'))).toBe('machine-a')
  })
})
