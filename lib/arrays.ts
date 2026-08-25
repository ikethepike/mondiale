/** A uniformly random element, or undefined when the array is empty.
 *  Pass a seeded `random` (e.g. alea) for reproducible picks. */
export const sample = <T>(array: readonly T[], random: () => number = Math.random): T | undefined =>
  array[Math.floor(random() * array.length)]

/** A uniform integer in [min, max] inclusive — the one home for the
 *  `Math.floor(Math.random() * …)` spelling, seedable like its siblings. */
export const randomInt = (min: number, max: number, random: () => number = Math.random): number =>
  min + Math.floor(random() * (max - min + 1))

/** A uniform float in [min, max) — jittered delays, window fractions. */
export const randomBetween = (
  min: number,
  max: number,
  random: () => number = Math.random
): number => min + random() * (max - min)

/** Up to `count` distinct elements, uniformly random, order shuffled.
 *  Pass a seeded `random` for reproducible picks, like the rest of this module. */
export const sampleMany = <T>(
  array: readonly T[],
  count: number,
  random: () => number = Math.random
): T[] => shuffleArray([...array], random).slice(0, count)

/**
 * A random entry where each candidate's chance is proportional to its weight.
 * Falls back to the last entry on floating-point shortfall; undefined when
 * empty or nothing weighs anything.
 */
export const weightedPick = <T>(
  entries: readonly (readonly [T, number])[],
  random: () => number = Math.random
): T | undefined => {
  const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0)
  if (!total) return entries[entries.length - 1]?.[0]

  let roll = random() * total
  for (const [value, weight] of entries) {
    roll -= Math.max(0, weight)
    if (roll <= 0) return value
  }
  return entries[entries.length - 1]?.[0]
}

/**
 * The whole set ordered by weighted draw without replacement — a shuffle where
 * a heavier entry is likelier to land early, and a lighter one still lands.
 *
 * `weightedPick` run down to nothing, so the two can never disagree about what
 * a weight means. Use it where a caller wants a rarity but must still be able
 * to fall through the whole list (the gauntlet's draw: a type that can't deal
 * hands off to the next one).
 */
export const weightedShuffle = <T>(
  entries: readonly (readonly [T, number])[],
  random: () => number = Math.random
): T[] => {
  const pool = [...entries]
  const order: T[] = []
  while (pool.length) {
    const drawn = weightedPick(pool, random)
    const index = pool.findIndex(([value]) => value === drawn)
    const [taken] = pool.splice(index < 0 ? 0 : index, 1)
    order.push(taken[0])
  }
  return order
}

export const shuffleArray = <T>(array: Array<T>, random: () => number = Math.random) => {
  let currentIndex = array.length,
    randomIndex

  // While there remain elements to shuffle.
  while (currentIndex != 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(random() * currentIndex)
    currentIndex--

    // And swap it with the current element.
    ;[array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]]
  }

  return array
}
