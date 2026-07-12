import type { ISOCountryCode } from '../geography.types'
import type { GroupChallenge } from './group-challenge.type'
import type { GroupModeChallenge } from './group-modes.type'

/**
 * Travle-style group round: every player gets the same start/target pair and
 * names the countries that bridge them by land. Difficulty is graded by the
 * shortest-route length dealt (see lib/traversal.ts).
 */
export interface TraversalChallenge {
  _type: 'traversal-challenge'
  start: ISOCountryCode
  target: ISOCountryCode
  /** Border crossings on a shortest route. */
  optimalHops: number
  /** One shortest route, endpoints included — shown as the correct answer. */
  optimalPath: ISOCountryCode[]
  /** Guesses a player may spend before the attempt auto-submits. */
  maximumClicks: number
  /** Points for matching the optimal route, scaled like the ranking rounds. */
  maximumPoints: number
  /**
   * Hard-mode twist: the route may only pass through members of this
   * alliance/bloc. Guesses outside it can never bridge the endpoints.
   */
  corridor?: {
    id: string
    name: string
    members: ISOCountryCode[]
  }
}

export type RoundChallenge = GroupChallenge | TraversalChallenge | GroupModeChallenge

/** Older persisted games have ranking challenges without a `_type`. */
export const isTraversalChallenge = (
  challenge: RoundChallenge | undefined
): challenge is TraversalChallenge => {
  return !!challenge && '_type' in challenge && challenge._type === 'traversal-challenge'
}

/**
 * Ranking rounds are the only challenges carrying an accessor `id`; the
 * traversal and group-mode formats key off `_type` instead. Older persisted
 * ranking challenges have no `_type`, so test for `id` rather than its absence.
 */
export const isGroupChallenge = (
  challenge: RoundChallenge | undefined
): challenge is GroupChallenge => {
  return !!challenge && 'id' in challenge
}

export type RoundChallengeKind =
  | 'ranking'
  | 'traversal'
  | 'border-chain'
  | 'heritage-hunt'
  | 'neighbour-blitz'
  | 'silhouette'
  | 'hot-cold'
  | 'sketch'
  | 'stat-detective'
  | 'two-truths'
  | 'river-run'
  | 'shared-shores'
  | 'highlands'
  | 'name-that-water'
  | 'mother-tongue'
  | 'flag-palette'
  | 'capital-guess'
  | 'ghost-state'
  | 'no-mans-land'
  | 'pin-landmark'

/** Single place that maps a round's challenge onto its gameplay kind. */
export const roundChallengeKind = (challenge: RoundChallenge | undefined): RoundChallengeKind => {
  if (!challenge || !('_type' in challenge)) return 'ranking'
  switch (challenge._type) {
    case 'traversal-challenge':
      return 'traversal'
    case 'border-chain-challenge':
      return 'border-chain'
    case 'heritage-hunt-challenge':
      return 'heritage-hunt'
    case 'neighbour-blitz-challenge':
      return 'neighbour-blitz'
    case 'silhouette-challenge':
      return 'silhouette'
    case 'hot-cold-challenge':
      return 'hot-cold'
    case 'sketch-challenge':
      return 'sketch'
    case 'stat-detective-challenge':
      return 'stat-detective'
    case 'two-truths-challenge':
      return 'two-truths'
    case 'water-blitz-challenge':
      switch (challenge.kind) {
        case 'river':
          return 'river-run'
        case 'sea':
        case 'lake':
          return 'shared-shores'
        default:
          return 'highlands'
      }
    case 'name-water-challenge':
      return 'name-that-water'
    case 'mother-tongue-challenge':
      return 'mother-tongue'
    case 'flag-palette-challenge':
      return 'flag-palette'
    case 'capital-guess-challenge':
      return 'capital-guess'
    case 'ghost-state-challenge':
      return 'ghost-state'
    case 'no-mans-land-challenge':
      return 'no-mans-land'
    case 'pin-landmark-challenge':
      return 'pin-landmark'
    default:
      return 'ranking'
  }
}
