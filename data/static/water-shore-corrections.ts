import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Hand-maintained corrections to the water answer keys — the countries a
 * River Run, Shared Shores or Highlands round asks for. The generator derives
 * those from Natural Earth geometry, and a key it gets wrong costs a player a
 * point for naming a real shore. Keyed by feature id; applied at the end of
 * create-water.ts, which warns for any entry that has stopped doing anything.
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
  // Shores NE's coarse polygons hold just past the shore distance.
  'atlantic-ocean': { include: ['TT'] },
  // India's coast is all Arabian Sea and Bay of Bengal polygons; New Zealand
  // lies east of the Indian Ocean's limit at Tasmania's meridian.
  'indian-ocean': { include: ['IN'], exclude: ['NZ'] },
  'ligurian-sea': { include: ['MC'] },
  'gulf-of-oman': { include: ['PK'] },
  'south-china-sea': { include: ['SG', 'TH'] },
  'strait-of-malacca': { include: ['SG'] },
  // NE draws today's shrunken lake; it is shared by all four.
  'lake-chad': { include: ['NE', 'NG'] },
  // Wholly inside Mongolia, a few km short of the Russian border.
  'lake-khovsgol-nuur': { exclude: ['RU'] },
  // The Ilemi tip of the map's South Sudan reaches the lake's northern end; its shores are KE and ET.
  'lake-turkana': { exclude: ['SS'] },

  // Landform overlap is against coarse NE outlines: the Sahara polygon runs
  // down to 9°N, deep into the Sahel.
  'desert-sahara': { exclude: ['BF', 'CF', 'CM', 'ET', 'NG', 'SN', 'SS'] },
  'desert-libyan-desert': { exclude: ['CF', 'SS'] },
  'desert-karakum-desert': { exclude: ['IR', 'KZ'] },
  'desert-chalbi-desert': { exclude: ['SS'] },
  'range-ethiopian-highlands': { exclude: ['SD', 'SS'] },
  'range-annamite-range': { exclude: ['TH'] },
  'range-karakoram': { exclude: ['TJ'] },
  'range-tatra-mountains': { exclude: ['CZ', 'UA'] },
  'range-alps': { include: ['MC'] },
  'range-himalayas': { include: ['PK'] },
}

/**
 * Keys that once shipped wrong in a direction no crash or broken name reveals,
 * pinned so a regeneration that brings one back fails. Micro-nations here are
 * benched below hard, so the in-play gate drops them from the dealt key; they
 * still have to be IN the shipped key for a hard game to ask for them.
 */
export interface RosterExpectation {
  includes: ISOCountryCode[]
  excludes: ISOCountryCode[]
}

export const WATER_ROSTER_EXPECTATIONS: Record<string, RosterExpectation> = {
  // Across the Strait of Gibraltar, not on the peninsula.
  'plateau-iberian-peninsula': { includes: ['AD', 'ES', 'FR', 'PT'], excludes: ['MA'] },
  // Wholly inside the range, so its outline never crosses them.
  'range-pyrenees': { includes: ['AD', 'ES', 'FR'], excludes: [] },
  'range-alps': { includes: ['AT', 'CH', 'IT', 'LI', 'MC'], excludes: [] },
  'range-stanovoy-range': { includes: ['RU'], excludes: [] },
  'mediterranean-sea': {
    includes: [
      'AL',
      'BA',
      'CY',
      'DZ',
      'EG',
      'ES',
      'FR',
      'GR',
      'HR',
      'IL',
      'IT',
      'LB',
      'LY',
      'MA',
      'MC',
      'ME',
      'MT',
      'PS',
      'SI',
      'SY',
      'TN',
      'TR',
    ],
    excludes: ['BG', 'JO', 'SM', 'VA'],
  },
  'adriatic-sea': { includes: ['AL', 'BA', 'HR', 'IT', 'ME', 'SI'], excludes: ['SM'] },
  'tyrrhenian-sea': { includes: ['FR', 'IT'], excludes: ['VA'] },
  'aegean-sea': { includes: ['GR', 'TR'], excludes: ['BG'] },
  'barents-sea': { includes: ['NO', 'RU'], excludes: ['FI'] },
  'norwegian-sea': { includes: ['IS', 'NO'], excludes: ['SE'] },
  'sea-of-japan': { includes: ['JP', 'KP', 'KR', 'RU'], excludes: ['CN'] },
  // Landlocked by the Factbook, real shores of the Caspian all the same.
  'caspian-sea': { includes: ['AZ', 'IR', 'KZ', 'RU', 'TM'], excludes: [] },
  'lake-chad': { includes: ['CM', 'NE', 'NG', 'TD'], excludes: [] },
  'lake-ladoga': { includes: ['RU'], excludes: ['FI'] },
  'desert-sahara': {
    includes: ['DZ', 'EG', 'LY', 'MA', 'ML', 'MR', 'NE', 'SD', 'TD', 'TN'],
    excludes: ['BF', 'CF', 'CM', 'ET', 'NG', 'SN', 'SS'],
  },
  'plateau-guiana-highlands': { includes: ['BR', 'GY', 'SR', 'VE'], excludes: [] },
  // NE names the Nile's upper reaches apart and breaks it at Lake Nasser.
  'river-nile': { includes: ['EG', 'SD', 'SS', 'UG'], excludes: [] },
  // The Alpine Rhine is the CH–LI border.
  'river-rhine': { includes: ['AT', 'CH', 'DE', 'FR', 'LI', 'NL'], excludes: [] },
  // NE's "Nu" splits the Salween, which dropped its Thai border reach.
  'river-salween': { includes: ['CN', 'MM', 'TH'], excludes: [] },
}
