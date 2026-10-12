import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Hand-maintained corrections to the geometry-derived shore lists of features
 * OFF the terrain roster — Name That Water's reveal and the sea lanes read
 * them. A roster subject's key lives in terrain-roster.ts alone; the generator
 * refuses an entry here that names one. Keyed by feature id; applied at the end
 * of create-water.ts, which warns for any entry that has stopped doing anything.
 * Re-run `bun run generate:water` after editing.
 */

/** A sea's named arms. NE cuts them out of the parent polygon, so the parent
 *  draws and lists them too; each arm still deals as itself. Never nest. */
export const WATER_PARTS: Record<string, string[]> = {
  'mediterranean-sea': [
    'adriatic-sea',
    'aegean-sea',
    'alboran-sea',
    'balearic-sea',
    'gulf-of-gabes',
    'gulf-of-lion',
    'gulf-of-sidra',
    'ionian-sea',
    'ligurian-sea',
    'sea-of-crete',
    'strait-of-gibraltar',
    'tyrrhenian-sea',
  ],
  'red-sea': ['gulf-of-aqaba', 'gulf-of-suez'],
  'gulf-of-guinea': ['bight-of-benin', 'bight-of-biafra'],
  'caribbean-sea': ['gulf-of-honduras', 'gulf-of-uraba'],
}

/** Shores the geometry misses or invents. An arm's correction carries into its whole;
 *  a whole's own correction is final. */
export interface ShoreCorrection {
  include?: ISOCountryCode[]
  exclude?: ISOCountryCode[]
}

export const WATER_SHORE_CORRECTIONS: Record<string, ShoreCorrection> = {
  'strait-of-malacca': { include: ['SG'] },
  // Wholly inside Mongolia, a few km short of the Russian border.
  'lake-khovsgol-nuur': { exclude: ['RU'] },
  // The Ilemi tip of the map's South Sudan reaches the lake's northern end; its shores are KE and ET.
  'lake-turkana': { exclude: ['SS'] },

  // Landform overlap is against coarse NE outlines.
  'desert-karakum-desert': { exclude: ['IR', 'KZ'] },
  'desert-chalbi-desert': { exclude: ['SS'] },
  'range-ethiopian-highlands': { exclude: ['SD', 'SS'] },
  'range-tatra-mountains': { exclude: ['CZ', 'UA'] },
}

/**
 * Derived keys that once shipped wrong in a direction no crash or broken name
 * reveals, pinned so a regeneration that brings one back fails.
 */
export interface RosterExpectation {
  includes: ISOCountryCode[]
  excludes: ISOCountryCode[]
}

export const WATER_ROSTER_EXPECTATIONS: Record<string, RosterExpectation> = {
  'range-stanovoy-range': { includes: ['RU'], excludes: [] },
  'tyrrhenian-sea': { includes: ['FR', 'IT'], excludes: ['VA'] },
  'aegean-sea': { includes: ['GR', 'TR'], excludes: ['BG'] },
  'barents-sea': { includes: ['NO', 'RU'], excludes: ['FI'] },
  'norwegian-sea': { includes: ['IS', 'NO'], excludes: ['SE'] },
  'lake-ladoga': { includes: ['RU'], excludes: ['FI'] },
}
