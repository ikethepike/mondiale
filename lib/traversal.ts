import { BORDERS } from '~~/data/borders.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import type { GameDifficulty, GameVariant } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { shuffleArray } from './arrays'

export const isNeighbour = (a: ISOCountryCode, b: ISOCountryCode): boolean =>
  BORDERS[a]?.includes(b) ?? false

/** BFS distances (in border crossings) from one country to every reachable one. */
export const distancesFrom = (origin: ISOCountryCode): Map<ISOCountryCode, number> => {
  const distances = new Map<ISOCountryCode, number>([[origin, 0]])
  const queue: ISOCountryCode[] = [origin]

  while (queue.length) {
    const current = queue.shift() as ISOCountryCode
    const distance = distances.get(current) as number
    for (const next of BORDERS[current] ?? []) {
      if (distances.has(next)) continue
      distances.set(next, distance + 1)
      queue.push(next)
    }
  }

  return distances
}

/**
 * Travle-style completion: does a land route from start to target exist using
 * only the guessed countries (plus the endpoints themselves)? The round
 * resolves the moment this turns true.
 */
export const isRouteComplete = (
  start: ISOCountryCode,
  target: ISOCountryCode,
  guesses: ISOCountryCode[],
  within?: Set<ISOCountryCode>
): boolean => {
  const usable = within ? guesses.filter(isoCode => within.has(isoCode)) : guesses
  const allowed = new Set<ISOCountryCode>([start, target, ...usable])
  const visited = new Set<ISOCountryCode>([start])
  const queue: ISOCountryCode[] = [start]

  while (queue.length) {
    const current = queue.shift() as ISOCountryCode
    if (current === target) return true
    for (const next of BORDERS[current] ?? []) {
      if (!allowed.has(next) || visited.has(next)) continue
      visited.add(next)
      queue.push(next)
    }
  }

  return false
}

/**
 * Shortest land route between two countries (BFS), including both endpoints.
 * Undefined when no land route exists (islands, separate landmasses).
 * `within` restricts the route to a subset of countries (alliance corridors).
 */
export const shortestPath = (
  from: ISOCountryCode,
  to: ISOCountryCode,
  within?: Set<ISOCountryCode>
): ISOCountryCode[] | undefined => {
  if (from === to) return [from]

  const cameFrom = new Map<ISOCountryCode, ISOCountryCode>()
  const queue: ISOCountryCode[] = [from]
  const visited = new Set<ISOCountryCode>([from])

  while (queue.length) {
    const current = queue.shift() as ISOCountryCode
    for (const next of BORDERS[current] ?? []) {
      if (visited.has(next)) continue
      if (within && next !== to && !within.has(next)) continue
      visited.add(next)
      cameFrom.set(next, current)

      if (next === to) {
        const path: ISOCountryCode[] = [to]
        let step: ISOCountryCode = to
        while (step !== from) {
          step = cameFrom.get(step) as ISOCountryCode
          path.unshift(step)
        }
        return path
      }

      queue.push(next)
    }
  }

  return undefined
}

/**
 * Hops (border crossings) between two countries on a shortest route by
 * difficulty: how far apart the dealt start/target should be.
 */
export const TRAVERSAL_DIFFICULTY: {
  [difficulty in GameDifficulty]: { minHops: number; maxHops: number }
} = {
  easy: { minHops: 2, maxHops: 3 },
  normal: { minHops: 4, maxHops: 5 },
  hard: { minHops: 6, maxHops: 8 },
}

export interface TraversalPick {
  start: ISOCountryCode
  target: ISOCountryCode
  /** Border crossings on a shortest route. */
  optimalHops: number
  /** One shortest route, endpoints included — the "correct" answer shown afterwards. */
  optimalPath: ISOCountryCode[]
}

/**
 * Deal a start/target pair whose shortest land route matches the difficulty
 * band. Viability falls out of the graph itself: islands and disconnected
 * landmasses simply never produce a qualifying path. Continent variants
 * restrict the candidate endpoints (routes may still pass anywhere).
 */
export const pickTraversal = (
  difficulty: GameDifficulty,
  variant: GameVariant = 'world',
  within?: Set<ISOCountryCode>
): TraversalPick | undefined => {
  const { minHops, maxHops } = TRAVERSAL_DIFFICULTY[difficulty]

  const candidates = shuffleArray(
    ISOCountryCodes.filter(isoCode => {
      if (!BORDERS[isoCode]?.length) return false
      if (within && !within.has(isoCode)) return false
      if (variant === 'world') return true
      return COUNTRIES[isoCode].region === variant
    })
  )

  const candidateSet = new Set(candidates)

  for (const start of candidates) {
    // One BFS from the start yields every candidate's distance
    const distances = new Map<ISOCountryCode, number>([[start, 0]])
    const queue: ISOCountryCode[] = [start]
    while (queue.length) {
      const current = queue.shift() as ISOCountryCode
      const distance = distances.get(current) as number
      if (distance >= maxHops) continue
      for (const next of BORDERS[current] ?? []) {
        if (distances.has(next)) continue
        if (within && !within.has(next)) continue
        distances.set(next, distance + 1)
        queue.push(next)
      }
    }

    const inBand = [...distances.entries()].filter(
      ([isoCode, distance]) =>
        distance >= minHops && distance <= maxHops && candidateSet.has(isoCode)
    )
    if (!inBand.length) continue

    const [target, optimalHops] = inBand[Math.floor(Math.random() * inBand.length)]
    const optimalPath = shortestPath(start, target, within)
    if (!optimalPath) continue

    return { start, target, optimalHops, optimalPath }
  }

  return undefined
}
