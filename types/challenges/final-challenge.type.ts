import { ISOCountryCode } from '../geography.types'
import { OrganizationVector } from '../organization.type'
import { GroupChallengeAccessorId } from './group-challenge.type'

export interface FinalChallenge {
  _type: 'individual-challenge'
  id: 'final'
  challenges: []
}

export interface RegionChallenge {
  _type: 'region-challenge'
  country: ISOCountryCode
  difficulty: 'easy'
}

export type MinMaxAccessorKeys = Extract<
  GroupChallengeAccessorId,
  | 'economics.gdpPerCapita'
  | 'economics.militarySpending'
  | 'gender.womenInParliament'
  | 'people.population'
  | 'health.alcoholConsumption'
  | 'humanRights.refugees'
  | 'people.obesity'
>

export interface MaxChallenge {
  _type: 'max-challenge'
  id: MinMaxAccessorKeys
}

export interface MembershipChallenge {
  _type: 'membership-challenge'
  id: keyof typeof OrganizationVector
  exception: ISOCountryCode
  difficulty: 'hard'
}
