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

export type GroupModeChallenge =
  | NeighbourBlitzChallenge
  | SilhouetteChallenge
  | HotColdChallenge
  | SketchChallenge
