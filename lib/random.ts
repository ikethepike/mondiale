/**
 * Mulberry32 — for values every seat must agree on without a round trip.
 * Never for dealing: the mix, the pools and the subjects are the server's.
 */
export const seededRandom = (seed: number): (() => number) => {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stable 31-bit hash — turns a shared identifier into a seed. */
export const seedFrom = (source: string): number => {
  let hash = 0
  for (let index = 0; index < source.length; index++) {
    hash = (hash * 31 + source.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}
