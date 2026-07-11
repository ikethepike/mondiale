import type { GameDifficulty } from '../game.types'
import type { ISOCountryCode } from '../geography.types'
import type { OrganizationVector } from '../organization.type'
import type { GroupChallengeAccessorId } from './group-challenge.type'

export interface FinalChallenge {
  _type: 'final-challenge'
  difficulty: GameDifficulty
  /** Remaining questions; the head is the live one. Redeals may replace it. */
  challenges: FinalChallengeItem[]
  /** Misses the run can still absorb (burn-and-advance). */
  lives: number
  /** Questions dealt at the start — the progress denominator. */
  totalCount: number
  /** Correct answers so far — the progress numerator. */
  answeredCorrect: number
}

export type FinalChallengeItem =
  | RegionChallenge
  | MinChallenge
  | MaxChallenge
  | LanguageChallenge
  | MembershipChallenge
  | LeadershipChallenge
  | SunsetBlitzChallenge
  | ScalesChallenge
  | BornChallenge
  | MadeChallenge
  | CityNocturneChallenge

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

/**
 * The finale: night sweeps the framed window east→west; type each country's
 * name before the dark takes it. Client-trust graded like higher-lower gates —
 * the client runs the sweep and submits the named set once.
 */
export interface SunsetBlitzChallenge {
  _type: 'sunset-blitz-challenge'
  /** The night window's countries, ordered east→west (darkening order). */
  countries: ISOCountryCode[]
  /**
   * Share of the countries in play that must be named. The absolute quota is
   * computed against what the player's screen actually shows (window ∪
   * visible), with the window itself as the floor.
   */
  quotaRatio: number
  durationSeconds: number
}

/** Click `quota` distinct countries that gained independence after `year` —
 *  one wrong pick ends the round. */
export interface BornChallenge {
  _type: 'born-challenge'
  year: number
  quota: number
}

/** Click a country whose top exports include `commodity`. */
export interface MadeChallenge {
  _type: 'made-challenge'
  commodity: string
}

/**
 * Night map, one ghost outline: type the target's biggest cities and each
 * lights up in place. Only ISO code + count travel the wire — both sides read
 * the city list from CITY_LIGHTS. Client-trust graded, like sunset.
 */
export interface CityNocturneChallenge {
  _type: 'city-nocturne-challenge'
  country: ISOCountryCode
  /** The top N of CITY_LIGHTS[country] in play. */
  cityCount: number
  quota: number
  durationSeconds: number
}

export type ScalesAccessorKey = Extract<
  GroupChallengeAccessorId,
  'people.population' | 'economics.gdpTotal'
>

/**
 * Balance the scales: pick up to `maxPicks` countries whose combined stat
 * lands within ±`tolerance` of the target's — overshooting loses too.
 */
export interface ScalesChallenge {
  _type: 'scales-challenge'
  accessorId: ScalesAccessorKey
  target: ISOCountryCode
  maxPicks: number
  /** Allowed deviation as a fraction of the target (0.2 = within 20%). */
  tolerance: number
}
