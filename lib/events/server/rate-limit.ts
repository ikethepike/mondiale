/**
 * Per-socket token bucket: a short burst is fine, a flood is not. Each
 * ephemeral relay gets its own instance so one channel's spam can't starve
 * another's tokens.
 */
export const createTokenBucket = (capacity: number, refillPerSecond: number) => {
  const buckets = new Map<string, { tokens: number; last: number }>()

  return {
    take(socketId: string, now: number): boolean {
      const bucket = buckets.get(socketId) ?? { tokens: capacity, last: now }
      const refill = ((now - bucket.last) / 1000) * refillPerSecond
      bucket.tokens = Math.min(capacity, bucket.tokens + refill)
      bucket.last = now
      buckets.set(socketId, bucket)

      if (bucket.tokens < 1) return false
      bucket.tokens -= 1
      return true
    },
    /** Called from the socket's `disconnect` so the map can't grow unbounded. */
    forget(socketId: string) {
      buckets.delete(socketId)
    },
  }
}
