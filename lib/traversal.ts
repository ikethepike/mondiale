import { BORDERS } from '~~/data/borders.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import type { GameDifficulty, GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { sample, shuffleArray } from './arrays'
import {
  isCountryInPlay,
  isCountryPlayable,
  microNationsIncluded,
  playableWorldCountries,
} from './game-rules'

export const isNeighbour = (a: ISOCountryCode, b: ISOCountryCode): boolean =>
  BORDERS[a]?.includes(b) ?? false

/**
 * The one graph a traversal round is played on: land borders, minus any
 * benched micro-nations, narrowed to the corridor when the round has one.
 * Undefined means the whole border graph — no restriction to apply.
 *
 * Dealer, live view and server scorer ALL derive their graph here. Two of them
 * walking different graphs is how a round ends up claiming a route is shortest
 * that the players were never allowed to walk (or missing a shorter one they
 * were).
 */
export const traversalWithin = (
  rules: GameRules,
  corridor?: readonly ISOCountryCode[]
): Set<ISOCountryCode> | undefined => {
  if (corridor) return new Set(corridor.filter(isoCode => isCountryInPlay(rules, isoCode)))
  // Benched micro-nations can't be guessed, so they can't be stepping stones
  // either — an unselectable bridge is an unwalkable one.
  if (!microNationsIncluded(rules)) return new Set(playableWorldCountries(rules))
  return undefined
}

/** `within` as a neighbour function — hand this to `distancesFrom`. */
export const neighboursWithin =
  (within?: Set<ISOCountryCode>) =>
  (isoCode: ISOCountryCode): ISOCountryCode[] => {
    const borders = BORDERS[isoCode] ?? []
    return within ? borders.filter(next => within.has(next)) : borders
  }

/**
 * BFS distances (in crossings) from one country to every reachable one.
 * Land borders by default; pass a neighbour function to narrow or widen the
 * graph (traversal hands in `neighboursWithin`, manhunt hands in
 * borders ∪ straits ∪ sea lanes).
 */
export const distancesFrom = (
  origin: ISOCountryCode,
  neighboursOf: (isoCode: ISOCountryCode) => ISOCountryCode[] = isoCode => BORDERS[isoCode] ?? []
): Map<ISOCountryCode, number> => {
  const distances = new Map<ISOCountryCode, number>([[origin, 0]])
  const queue: ISOCountryCode[] = [origin]

  while (queue.length) {
    const current = queue.shift() as ISOCountryCode
    const distance = distances.get(current) as number
    for (const next of neighboursOf(current)) {
      if (distances.has(next)) continue
      distances.set(next, distance + 1)
      queue.push(next)
    }
  }

  return distances
}

export interface RouteOptions {
  /** Countries the route may pass through. Endpoints always may.  */
  within?: Set<ISOCountryCode>
  /** Among equally short routes, the one through these wins. */
  prefer?: Iterable<ISOCountryCode>
}

/**
 * A hop costs `HOP_COST`; stepping outside `prefer` costs 1. No route is long
 * enough for the tie-breaker to add up to a hop, so length always rules and
 * `prefer` only ever chooses between routes already tied on length.
 */
const HOP_COST = 1024

/**
 * Shortest land route between two countries, endpoints included. Undefined
 * when no route exists (islands, separate landmasses, a corridor that doesn't
 * connect).
 *
 * Deterministic: ties break towards `prefer` and then on ISO order, so a pair
 * always reveals the same route rather than whichever neighbour the border
 * data happened to list first.
 */
export const shortestRoute = (
  from: ISOCountryCode,
  to: ISOCountryCode,
  { within, prefer }: RouteOptions = {}
): ISOCountryCode[] | undefined => {
  if (from === to) return [from]

  const allowed = within ? new Set<ISOCountryCode>([...within, from, to]) : undefined
  const preferred = prefer ? new Set(prefer) : undefined

  const cost = new Map<ISOCountryCode, number>([[from, 0]])
  const cameFrom = new Map<ISOCountryCode, ISOCountryCode>()
  const settled = new Set<ISOCountryCode>()

  for (;;) {
    let current: ISOCountryCode | undefined
    let spent = Infinity
    for (const [isoCode, candidate] of cost) {
      if (settled.has(isoCode)) continue
      if (candidate < spent || (candidate === spent && current && isoCode < current)) {
        current = isoCode
        spent = candidate
      }
    }
    if (!current) return undefined

    if (current === to) {
      const route: ISOCountryCode[] = [to]
      let step: ISOCountryCode = to
      while (step !== from) {
        step = cameFrom.get(step) as ISOCountryCode
        route.unshift(step)
      }
      return route
    }

    settled.add(current)
    for (const next of BORDERS[current] ?? []) {
      if (allowed && !allowed.has(next)) continue
      const step = spent + HOP_COST + (preferred?.has(next) ? 0 : 1)
      if (step >= (cost.get(next) ?? Infinity)) continue
      cost.set(next, step)
      cameFrom.set(next, current)
    }
  }
}

/** Border crossings on a route — what the round counts, not the flag count. */
export const routeHops = (route: ISOCountryCode[]): number => Math.max(0, route.length - 1)

/**
 * The route a player's guesses actually build: the shortest bridge from start
 * to target through those guesses alone, endpoints included. Undefined until
 * the guesses connect — which is the moment the round resolves.
 */
export const routeThrough = (
  start: ISOCountryCode,
  target: ISOCountryCode,
  guesses: ISOCountryCode[],
  within?: Set<ISOCountryCode>
): ISOCountryCode[] | undefined => {
  const usable = within ? guesses.filter(isoCode => within.has(isoCode)) : guesses
  return shortestRoute(start, target, { within: new Set([...usable, start, target]) })
}

/**
 * Travle-style completion: do the guessed countries bridge start to target?
 * The same bridge the reveal draws, so a round that ends is a round with a
 * route to show for it.
 */
export const isRouteComplete = (
  start: ISOCountryCode,
  target: ISOCountryCode,
  guesses: ISOCountryCode[],
  within?: Set<ISOCountryCode>
): boolean => !!routeThrough(start, target, guesses, within)

/**
 * Guesses that hang off either endpoint through other guesses — everything
 * else is a stray. Same graph as the route, so the chip list, the map tint and
 * the round's end can never disagree about what a guess was worth.
 */
export const linkedGuesses = (
  start: ISOCountryCode,
  target: ISOCountryCode,
  guesses: ISOCountryCode[],
  within?: Set<ISOCountryCode>
): Set<ISOCountryCode> => {
  const usable = new Set(within ? guesses.filter(isoCode => within.has(isoCode)) : guesses)
  const linked = new Set<ISOCountryCode>()
  const queue: ISOCountryCode[] = [start, target]
  const visited = new Set<ISOCountryCode>(queue)

  while (queue.length) {
    const current = queue.shift() as ISOCountryCode
    for (const next of BORDERS[current] ?? []) {
      if (visited.has(next) || !usable.has(next)) continue
      visited.add(next)
      linked.add(next)
      queue.push(next)
    }
  }

  return linked
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
 * restrict the candidate endpoints (routes may still pass anywhere, since a
 * border doesn't stop at the board's edge); a corridor restricts both.
 */
export const pickTraversal = (
  rules: GameRules,
  corridor?: readonly ISOCountryCode[]
): TraversalPick | undefined => {
  const { minHops, maxHops } = TRAVERSAL_DIFFICULTY[rules.difficulty]
  const within = traversalWithin(rules, corridor)
  const neighboursOf = neighboursWithin(within)

  const candidates = shuffleArray(
    ISOCountryCodes.filter(isoCode => {
      if (!BORDERS[isoCode]?.length) return false
      if (within && !within.has(isoCode)) return false
      return isCountryPlayable(rules, isoCode)
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
      for (const next of neighboursOf(current)) {
        if (distances.has(next)) continue
        distances.set(next, distance + 1)
        queue.push(next)
      }
    }

    const inBand = [...distances.entries()].filter(
      ([isoCode, distance]) =>
        distance >= minHops && distance <= maxHops && candidateSet.has(isoCode)
    )
    if (!inBand.length) continue

    const [target] = sample(inBand)!
    const optimalPath = shortestRoute(start, target, { within })
    if (!optimalPath) continue

    // Hops come off the revealed route itself — a count derived separately is
    // a count that can disagree with the flags on screen.
    return { start, target, optimalHops: routeHops(optimalPath), optimalPath }
  }

  return undefined
}
