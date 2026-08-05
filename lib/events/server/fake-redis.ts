import type { Redis } from '@upstash/redis'

/**
 * In-memory stand-in for the handful of commands the ownership lease uses.
 * Test scaffolding only — never imported by runtime code. `eval` mirrors the
 * RELEASE_SCRIPT's compare-and-delete semantics; TTLs are not modelled (a
 * lapsed lease is simply an absent key).
 */
export const fakeRedis = () => {
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

export type FakeRedis = ReturnType<typeof fakeRedis>

export const asRedis = (fake: FakeRedis) => fake as unknown as Redis
