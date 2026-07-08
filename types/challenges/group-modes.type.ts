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

/** Physical-geography flavours (mirror of data/water.gen's WaterKind). */
export type WaterFeatureKind = 'sea' | 'lake' | 'river' | 'range' | 'desert' | 'plateau'

/**
 * Name the countries a physical feature touches: rivers (river run), seas
 * and lakes (shared shores), ranges/deserts/plateaus (highlands, hard mode).
 * Geometry stays client-side in data/water.gen — only the id travels.
 */
export interface WaterBlitzChallenge {
  _type: 'water-blitz-challenge'
  featureId: string
  featureName: string
  kind: WaterFeatureKind
  /** The answers: playable countries the feature touches or crosses. */
  countries: ISOCountryCode[]
  durationSeconds: number
  maximumPoints: number
}

/** A capital-city photo is shown — name the country (live guesses). */
export interface CapitalGuessChallenge {
  _type: 'capital-guess-challenge'
  country: ISOCountryCode
  /** The capital skyline photo (public path). */
  image: string
  durationSeconds: number
  maximumPoints: number
}

/** Only a flag's colour swatches are shown — name the country (live guesses). */
export interface FlagPaletteChallenge {
  _type: 'flag-palette-challenge'
  country: ISOCountryCode
  /** The flag's colours as hex swatches, shown WITHOUT the flag. */
  swatches: string[]
  durationSeconds: number
  maximumPoints: number
}

/** A language is named — tap every country that speaks it (all-that-apply). */
export interface MotherTongueChallenge {
  _type: 'mother-tongue-challenge'
  language: string
  /** The answers: playable countries with this as an official language. */
  countries: ISOCountryCode[]
  durationSeconds: number
  maximumPoints: number
}

/** A body of water lights up — name it (typed, with suggestions). */
export interface NameWaterChallenge {
  _type: 'name-water-challenge'
  featureId: string
  featureName: string
  kind: WaterFeatureKind
  /** Shore countries, shown in the reveal/scorecard. */
  countries: ISOCountryCode[]
  maximumPoints: number
}

export type GroupModeChallenge =
  | NeighbourBlitzChallenge
  | SilhouetteChallenge
  | HotColdChallenge
  | SketchChallenge
  | StatDetectiveChallenge
  | TwoTruthsChallenge
  | WaterBlitzChallenge
  | NameWaterChallenge
  | MotherTongueChallenge
  | FlagPaletteChallenge
  | CapitalGuessChallenge
