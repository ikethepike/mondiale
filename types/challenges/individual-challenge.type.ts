import type { GroupChallengeAccessorId } from './group-challenge.type'
import type { TrendMetricId } from '../../lib/trends'
import type { ISOCountryCode } from '../geography.types'

/**
 * Individual challenges gate the board: answer correctly to leap ahead, fail
 * and you're knocked back. They all validate the same way server-side — the
 * submitted ISO code must equal `country` — so every variant encodes its
 * winning answer there:
 * - 'find' (default / legacy data): locate `country` on the map
 * - 'flag-pick': `country`'s flag among lookalike decoys in `options`
 * - 'odd-one-out': `country` is the impostor among `oddOneOut.countries`
 * - 'higher-lower': three stat duels; the client submits `country` only when
 *   every duel was answered correctly (same client-trust model as the map)
 * - 'trend-duel': which of two countries' stat is rising/falling — a streak of
 *   pairs with one guaranteed riser + one faller (higher-lower's trust model)
 * - 'trajectory-match': a mystery sparkline — whose chart is this? Timed like
 *   border-detective, one buyable strike-out hint
 * - 'leader-pick': whose leader is named — `options` are the candidate
 *   countries, their leaders shown as the answers
 * - 'outline-reveal' (hard mode): `country`'s border draws itself in; name
 *   it by typing before the clock runs out — one wrong guess fails the gate
 * - 'leader-portrait': a leader's photo (from the Wikidata-generated leader
 *   data) — pick which of the `options` countries they govern
 */
export interface IndividualChallenge {
  _type: 'individual-challenge'
  id: IndividualChallengeAccessorId
  country: ISOCountryCode
  variant?: IndividualChallengeVariant
  /** flag-pick: the flags on offer (includes `country`), display order. */
  options?: ISOCountryCode[]
  /** odd-one-out: the lineup (includes `country`) and what the others share. */
  oddOneOut?: {
    countries: ISOCountryCode[]
    propertyLabel: string
  }
  /** higher-lower: stat duels, answered in order. */
  higherLower?: {
    accessorId: GroupChallengeAccessorId
    pairs: { a: ISOCountryCode; b: ISOCountryCode }[]
  }
  /** trend-duel: which country's stat trends `seek`-ward — one riser + one
   *  faller per pair, answered in order; the client submits `country` only on
   *  a clean streak (same client-trust model as higher-lower, truth derived
   *  from TRENDS via readTrend). */
  trendDuels?: {
    metric: TrendMetricId
    seek: 'rising' | 'falling'
    a: ISOCountryCode
    b: ISOCountryCode
  }[]
  /** trajectory-match: whose chart is this? Timed gate like border-detective —
   *  the clock fraction scales the leap and the one buyable hint (strike out
   *  half the decoys) bites steps via gateLeapSteps. */
  trajectory?: {
    metric: TrendMetricId
    /** Includes `country`, display order. */
    options: ISOCountryCode[]
    /** Non-hard: y-axis values revealed free in the final third. */
    valuesHint: boolean
  }
  /** leader-portrait: the face on the card (name shown only in the result). */
  portrait?: {
    image: string
    name: string
  }
  /** border-detective: the mystery country's neighbours, shown as a flag ring
   *  (the answer `country` is NOT among them — it sits in the empty centre).
   *  Timed: the clock fraction left scales the leap, and an outline hint
   *  (unlocked a third of the way in) costs steps (see `gateLeapSteps`). */
  neighbours?: ISOCountryCode[]
  /** capital-match / photo gates: a photo (capital skyline, landmark) whose
   *  country the player names from `options`. */
  image?: string
  /** landmark-quiz: which curated landmark (LANDMARKS key). The reveal shows
   *  its dossier (name, description) and marks its true spot on the map. */
  landmarkSlug?: string
}

export const individualChallengeVariants = [
  'find',
  'flag-pick',
  'flag-twins',
  'border-detective',
  'money-match',
  'zoom-out',
  'capital-match',
  'landmark-quiz',
  'odd-one-out',
  'higher-lower',
  'trend-duel',
  'trajectory-match',
  'leader-pick',
  'outline-reveal',
  'leader-portrait',
] as const
export type IndividualChallengeVariant = (typeof individualChallengeVariants)[number]

export const individualChallengeAccessors = ['flag', 'isoCode', 'capital.name'] as const
export type IndividualChallengeAccessorId = (typeof individualChallengeAccessors)[number]
export const isValidIndividualChallengeAccessorId = (
  accessorId: unknown
): accessorId is IndividualChallengeAccessorId => {
  return (
    typeof accessorId === 'string' &&
    individualChallengeAccessors.includes(accessorId as IndividualChallengeAccessorId)
  )
}
