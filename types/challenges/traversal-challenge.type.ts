import type { ISOCountryCode } from '../geography.types'
import type { GroupChallenge } from './group-challenge.type'

/**
 * Travle-style group round: every player gets the same start/target pair and
 * builds a land route by clicking bordering countries. Difficulty is graded
 * by the shortest-route length dealt (see lib/traversal.ts).
 */
export interface TraversalChallenge {
  _type: 'traversal-challenge'
  start: ISOCountryCode
  target: ISOCountryCode
  /** Border crossings on a shortest route. */
  optimalHops: number
  /** One shortest route, endpoints included — shown as the correct answer. */
  optimalPath: ISOCountryCode[]
  /** Crossings a player may use before the attempt auto-submits. */
  maximumClicks: number
  /** Points for matching the optimal route, scaled like the ranking rounds. */
  maximumPoints: number
}

export type RoundChallenge = GroupChallenge | TraversalChallenge

/** Older persisted games have ranking challenges without a `_type`. */
export const isTraversalChallenge = (
  challenge: RoundChallenge | undefined
): challenge is TraversalChallenge => {
  return !!challenge && '_type' in challenge && challenge._type === 'traversal-challenge'
}
