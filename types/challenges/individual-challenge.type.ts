import { ISOCountryCode } from '../geography.types'

export interface IndividualChallenge {
  _type: 'individual-challenge'
  id: IndividualChallengeAccessorId
  country: ISOCountryCode
}

export const individualChallengeAccessors = ['flag', 'isoCode', 'capital.name'] as const
export type IndividualChallengeAccessorId = typeof individualChallengeAccessors[number]
export const isValidIndividualChallengeAccessorId = (
  accessorId: any
): accessorId is IndividualChallengeAccessorId => {
  return !!accessorId && individualChallengeAccessors.includes(accessorId)
}
