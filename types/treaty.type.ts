import type { ISOCountryCode } from './geography.types'

/**
 * The instruments the game asks about, and what being "in" one means.
 *
 * Lives here rather than in the generator because the app reads it at runtime:
 * a generator module runs its own pipeline on import, so anything the client
 * bundles has to be free of that. Status data is generated
 * (generators/vendors/untc/create-treaties.ts → data/treaties.gen.ts); the
 * roster and its names are editorial.
 */

export type TreatyId =
  | 'rome-statute'
  | 'iccpr'
  | 'icescr'
  | 'crc'
  | 'cedaw'
  | 'cat'
  | 'paris'
  | 'kyoto'
  | 'cbd'
  | 'mine-ban'
  | 'cluster-munitions'
  | 'att'
  | 'unclos'
  | 'schengen'
  | 'echr'

export type TreatyStanding =
  /** Ratified, acceded or succeeded — bound by it. */
  | 'party'
  /** Signed and never ratified: on the record as interested, not bound. */
  | 'signatory'
  /** Was a party and left. */
  | 'withdrawn'

export interface TreatyStatus {
  standing: TreatyStanding
  /**
   * The year the standing dates from: joined, signed, or — on a withdrawal —
   * left.
   *
   * The SCRAPE never fills it for a withdrawal. UNTC brackets the original
   * dates to mark one and states the effective date in a footnote it does not
   * parse, so the only year in the row is the year they joined; writing that
   * as the year they left would be a lie the reveal repeats. Curated entries
   * in data/static/treaty-corrections.ts may set it, because there the exit
   * year is known rather than inferred.
   */
  year?: number
}

export type TreatyMapping = {
  [treaty in TreatyId]?: { [iso in ISOCountryCode]?: TreatyStatus }
}

export type TreatyFamily =
  'human-rights' | 'climate' | 'arms-control' | 'law-of-the-sea' | 'mobility'

export interface TreatyMeta {
  id: TreatyId
  /** The instrument's formal name, for a reveal. */
  name: string
  /** What a prompt calls it. */
  shortName: string
  family: TreatyFamily
  /** UNTC coordinates; absent means it comes from elsewhere. */
  untc?: { mtdsg: string; chapter: number }
  /** Refuse to write below this many parties — catches a partial parse. */
  minimumParties: number
}

/**
 * Floors sit ~10% under the counts observed when this was written: enough
 * slack for a withdrawal or a reclassification, tight enough that a parse
 * returning a fraction of the table fails instead of shipping.
 *
 * The Montreal Protocol is deliberately absent — 198 parties and no holdouts,
 * so it could never pass the dealer's "somebody has to be outside" test.
 */
export const TREATY_META: readonly TreatyMeta[] = [
  // Human rights — where the signed-never-ratified column earns its keep.
  {
    id: 'crc',
    name: 'Convention on the Rights of the Child',
    shortName: 'Convention on the Rights of the Child',
    family: 'human-rights',
    untc: { mtdsg: 'IV-11', chapter: 4 },
    minimumParties: 180,
  },
  {
    id: 'cedaw',
    name: 'Convention on the Elimination of All Forms of Discrimination against Women',
    shortName: 'Convention on Discrimination against Women',
    family: 'human-rights',
    untc: { mtdsg: 'IV-8', chapter: 4 },
    minimumParties: 170,
  },
  {
    id: 'iccpr',
    name: 'International Covenant on Civil and Political Rights',
    shortName: 'Covenant on Civil and Political Rights',
    family: 'human-rights',
    untc: { mtdsg: 'IV-4', chapter: 4 },
    minimumParties: 155,
  },
  {
    id: 'icescr',
    name: 'International Covenant on Economic, Social and Cultural Rights',
    shortName: 'Covenant on Economic, Social and Cultural Rights',
    family: 'human-rights',
    untc: { mtdsg: 'IV-3', chapter: 4 },
    minimumParties: 155,
  },
  {
    id: 'cat',
    name: 'Convention against Torture',
    shortName: 'Convention against Torture',
    family: 'human-rights',
    untc: { mtdsg: 'IV-9', chapter: 4 },
    minimumParties: 155,
  },
  {
    id: 'rome-statute',
    name: 'Rome Statute of the International Criminal Court',
    shortName: 'Rome Statute',
    family: 'human-rights',
    untc: { mtdsg: 'XVIII-10', chapter: 18 },
    minimumParties: 110,
  },

  // Climate and environment.
  {
    id: 'paris',
    name: 'Paris Agreement',
    shortName: 'Paris Agreement',
    family: 'climate',
    untc: { mtdsg: 'XXVII-7-d', chapter: 27 },
    minimumParties: 175,
  },
  {
    id: 'kyoto',
    name: 'Kyoto Protocol',
    shortName: 'Kyoto Protocol',
    family: 'climate',
    untc: { mtdsg: 'XXVII-7-a', chapter: 27 },
    minimumParties: 170,
  },
  {
    id: 'cbd',
    name: 'Convention on Biological Diversity',
    shortName: 'Convention on Biological Diversity',
    family: 'climate',
    untc: { mtdsg: 'XXVII-8', chapter: 27 },
    minimumParties: 175,
  },

  // Arms control.
  {
    id: 'mine-ban',
    name: 'Anti-Personnel Mine Ban Convention',
    shortName: 'Mine Ban Treaty',
    family: 'arms-control',
    untc: { mtdsg: 'XXVI-5', chapter: 26 },
    minimumParties: 145,
  },
  {
    id: 'cluster-munitions',
    name: 'Convention on Cluster Munitions',
    shortName: 'Convention on Cluster Munitions',
    family: 'arms-control',
    untc: { mtdsg: 'XXVI-6', chapter: 26 },
    minimumParties: 100,
  },
  {
    id: 'att',
    name: 'Arms Trade Treaty',
    shortName: 'Arms Trade Treaty',
    family: 'arms-control',
    untc: { mtdsg: 'XXVI-8', chapter: 26 },
    minimumParties: 105,
  },

  // Law of the sea.
  {
    id: 'unclos',
    name: 'United Nations Convention on the Law of the Sea',
    shortName: 'Law of the Sea Convention',
    family: 'law-of-the-sea',
    untc: { mtdsg: 'XXI-6', chapter: 21 },
    minimumParties: 155,
  },

  // Non-UNTC: Wikidata and the curated list.
  {
    id: 'schengen',
    name: 'Schengen Area',
    shortName: 'Schengen Area',
    family: 'mobility',
    minimumParties: 25,
  },
  {
    id: 'echr',
    name: 'European Convention on Human Rights',
    shortName: 'European Convention on Human Rights',
    family: 'human-rights',
    minimumParties: 40,
  },
]

/** The one place an instrument's names come from — prompt and reveal both. */
export const treatyMeta = (treaty: TreatyId): TreatyMeta => {
  const meta = TREATY_META.find(entry => entry.id === treaty)
  if (!meta) throw new Error(`Unknown treaty: ${treaty}`)
  return meta
}
