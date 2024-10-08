import type { GameDifficulty } from '../game.types'
import type { ISOCountryCode } from '../geography.types'
import { OrganizationVector } from '../organization.type'
import type { GroupChallengeAccessorId } from './group-challenge.type'

interface BaseFinalChallenge<Challenges, Difficulty extends GameDifficulty> {
  _type: 'final-challenge'
  difficulty: Difficulty
  challenges: Challenges
}

export type FinalChallenge =
  | BaseFinalChallenge<Array<RegionChallenge | LanguageChallenge>, 'easy'>
  | BaseFinalChallenge<
      Array<RegionChallenge | MaxChallenge | MinChallenge | LanguageChallenge>,
      'normal'
    >
  | BaseFinalChallenge<
      Array<
        LanguageChallenge | MaxChallenge | MinChallenge | MembershipChallenge | LeadershipChallenge
      >,
      'hard'
    >

export interface RegionChallenge {
  _type: 'region-challenge'
  country: ISOCountryCode
}

export type MinMaxAccessorKeys = Extract<
  GroupChallengeAccessorId,
  | 'economics.gdpPerCapita'
  | 'economics.militarySpending'
  | 'gender.womenInParliament'
  | 'people.population'
  | 'health.alcoholConsumption'
  | 'humanRights.refugees'
  | 'health.obesity'
>

export interface MaxChallenge {
  _type: 'max-challenge'
  accessorId: MinMaxAccessorKeys
  country: ISOCountryCode
  hints: ISOCountryCode[]
}

export interface ConflictChallenge {
  _type: 'conflict-challenge'
  countries: ISOCountryCode[]
}

export interface MinChallenge {
  _type: 'min-challenge'
  accessorId: MinMaxAccessorKeys
  country: ISOCountryCode
  hints: ISOCountryCode[]
}

export interface MembershipChallenge {
  _type: 'membership-challenge'
  exception: ISOCountryCode
  organization: keyof typeof OrganizationVector
}

export interface LeadershipChallenge {
  _type: 'leadership-challenge'
  country: ISOCountryCode
}

export interface LanguageChallenge {
  _type: 'language-challenge'
  language: string
}
