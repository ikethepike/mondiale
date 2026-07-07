import type { GroupChallengeAccessorId } from './group-challenge.type'
import type { ISOCountryCode } from '../geography.types'

/**
 * The newer group round formats. Like ranking and traversal rounds, every
 * player gets the same prompt and the earned points convert into board steps.
 */

/** Name as many of a country's land neighbours as you can before time runs out. */
export interface NeighbourBlitzChallenge {
  _type: 'neighbour-blitz-challenge'
  country: ISOCountryCode
  neighbours: ISOCountryCode[]
  durationSeconds: number
  maximumPoints: number
}

/** A country's outline draws itself in — buzz early for more points. */
export interface SilhouetteChallenge {
  _type: 'silhouette-challenge'
  country: ISOCountryCode
  durationSeconds: number
  maximumPoints: number
}

/** A mystery country: every map click answers with distance and direction. */
export interface HotColdChallenge {
  _type: 'hot-cold-challenge'
  country: ISOCountryCode
  maximumGuesses: number
  maximumPoints: number
}

/** Draw the country's outline from memory; scored against the real shape. */
export interface SketchChallenge {
  _type: 'sketch-challenge'
  country: ISOCountryCode
  maximumPoints: number
}

/**
 * A mystery country's stats flip over one by one — buzz in early for more
 * points. Clue values are looked up client-side from the shared dataset;
 * the payload only names which accessors reveal, in which order.
 */
export interface StatDetectiveChallenge {
  _type: 'stat-detective-challenge'
  country: ISOCountryCode
  /** Accessor ids revealed in order, one per interval. */
  clues: GroupChallengeAccessorId[]
  secondsPerClue: number
  maximumPoints: number
}

/**
 * Three stat claims about one country — one value secretly belongs to a
 * different country. Spot the lie in one shot.
 */
export interface TwoTruthsChallenge {
  _type: 'two-truths-challenge'
  country: ISOCountryCode
  statements: {
    accessorId: GroupChallengeAccessorId
    /** The claimed value (the lie carries the decoy country's value). */
    amount: number
    unit: string
  }[]
  /** Index into `statements` of the falsified claim. */
  lieIndex: number
  /** Where the lie's value really comes from — shown in the reveal. */
  lieSource: ISOCountryCode
  maximumPoints: number
}

export type GroupModeChallenge =
  | NeighbourBlitzChallenge
  | SilhouetteChallenge
  | HotColdChallenge
  | SketchChallenge
  | StatDetectiveChallenge
  | TwoTruthsChallenge
