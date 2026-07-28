/** A uniformly random element, or undefined when the array is empty. */
export const sample = <T>(array: readonly T[]): T | undefined =>
  array[Math.floor(Math.random() * array.length)]

/** Up to `count` distinct elements, uniformly random, order shuffled. */
export const sampleMany = <T>(array: readonly T[], count: number): T[] =>
  shuffleArray([...array]).slice(0, count)

/**
 * A random entry where each candidate's chance is proportional to its weight.
 * Falls back to the last entry on floating-point shortfall; undefined when
 * empty or nothing weighs anything.
 */
export const weightedPick = <T>(entries: readonly (readonly [T, number])[]): T | undefined => {
  const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0)
  if (!total) return entries[entries.length - 1]?.[0]

  let roll = Math.random() * total
  for (const [value, weight] of entries) {
    roll -= Math.max(0, weight)
    if (roll <= 0) return value
  }
  return entries[entries.length - 1]?.[0]
}

export const shuffleArray = <T>(array: Array<T>) => {
  let currentIndex = array.length,
    randomIndex

  // While there remain elements to shuffle.
  while (currentIndex != 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex)
    currentIndex--

    // And swap it with the current element.
    ;[array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]]
  }

  return array
}
