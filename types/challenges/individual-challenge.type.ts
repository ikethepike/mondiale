import type { GroupChallengeAccessorId } from './group-challenge.type'
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
 * - 'leader-pick': whose leader is named — `options` are the candidate
 *   countries, their leaders shown as the answers
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
}

export const individualChallengeVariants = [
  'find',
  'flag-pick',
  'odd-one-out',
  'higher-lower',
  'leader-pick',
] as const
export type IndividualChallengeVariant = (typeof individualChallengeVariants)[number]

export const individualChallengeAccessors = ['flag', 'isoCode', 'capital.name'] as const
export type IndividualChallengeAccessorId = (typeof individualChallengeAccessors)[number]
export const isValidIndividualChallengeAccessorId = (
  accessorId: any
): accessorId is IndividualChallengeAccessorId => {
  return !!accessorId && individualChallengeAccessors.includes(accessorId)
}
