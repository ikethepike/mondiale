/**
 * Mulberry32 — a small, fast, seeded PRNG.
 *
 * `Math.random` is right for anything a single client decides alone. This is
 * for the opposite case: a value every seat must AGREE on without a round
 * trip. A backdrop's layout is the example — the wall behind a round has to be
 * the same wall on every screen at the table, so it is derived from shared
 * state (the room and the round) rather than rolled locally.
 *
 * Not for dealing. The mix, the pools and the subjects are the server's to
 * choose; a client that seeds its own deal has invented a second dealer.
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

/** A stable 31-bit hash of a string — for turning shared identifiers (a room
 *  id, a round number) into a seed both ends compute the same way. */
export const seedFrom = (source: string): number => {
  let hash = 0
  for (let index = 0; index < source.length; index++) {
    hash = (hash * 31 + source.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}
