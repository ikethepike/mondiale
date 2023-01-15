import { COUNTRIES } from '~~/data/countries.gen'
import {
  FinalChallenge,
  LanguageChallenge,
  LeadershipChallenge,
  MaxChallenge,
  MembershipChallenge,
  MinChallenge,
  MinMaxAccessorKeys,
  RegionChallenge,
} from '~~/types/challenges/final-challenge.type'
import { Game } from '~~/types/game.types'
import { Amount, ISOCountryCode, isValidISOCode } from '~~/types/geography.types'
import {
  isOrganizationKey,
  organizationRegions,
  OrganizationVector,
} from '~~/types/organization.type'
import { shuffleArray } from '../arrays'
import { getRandomISOCountryCode } from '../country'
import { getValueByAccessorID } from '../values'

export const getFinalChallenges = ({ game }: { game: Game }): FinalChallenge => {
  switch (game.difficulty) {
    case 'easy':
      return {
        _type: 'final-challenge',
        difficulty: 'easy',
        challenges: [getRegionChallenge(), getLanguageChallenge()],
      }
    case 'normal': {
      const middleChallenge = Math.random() < 0.5 ? getMinChallenge() : getMaxChallenge()

      return {
        _type: 'final-challenge',
        difficulty: 'normal',
        challenges: [getRegionChallenge(), middleChallenge, getLanguageChallenge()],
      }
    }

    case 'hard': {
      return {
        _type: 'final-challenge',
        difficulty: 'hard',
        challenges: [
          getLanguageChallenge(),
          getMaxChallenge(),
          getMinChallenge(),
          getMembershipChallenge(),
          getLeadershipChallenge(),
        ],
      }
    }
  }
}

const getRegionChallenge = (): RegionChallenge => {
  return {
    _type: 'region-challenge',
    country: getRandomISOCountryCode('large'),
  }
}

const getLanguageChallenge = (): LanguageChallenge => {
  const languages = Object.values(COUNTRIES).flatMap(country => country.languages)
  const language = shuffleArray(languages).shift()
  if (!language) throw new ReferenceError(`No language found in language challenge`)

  return {
    _type: 'language-challenge',
    language,
  }
}

const minMaxAccessors: MinMaxAccessorKeys[] = [
  'economics.gdpPerCapita',
  'economics.militarySpending',
  'gender.womenInParliament',
  'people.population',
  'health.alcoholConsumption',
  'humanRights.refugees',
  'health.obesity',
]

/**
 * Returns a sorted array (max -> min) of a given value key
 */
const getSortedRanking = () => {
  const accessorId = minMaxAccessors[Math.floor(minMaxAccessors.length * Math.random())]
  const sortedCountries: { amount: Amount<any>; isoCode: ISOCountryCode }[] = []

  for (const isoCode of Object.keys(COUNTRIES)) {
    if (!isValidISOCode(isoCode)) continue
    const amount = getValueByAccessorID(isoCode, accessorId)
    if (!amount) continue

    sortedCountries.push({
      amount,
      isoCode,
    })
  }

  return {
    accessorId,
    sortedcountries: sortedCountries.sort((a, b) => b.amount.amount - a.amount.amount),
  }
}

const getMaxChallenge = (): MaxChallenge => {
  const { accessorId, sortedcountries } = getSortedRanking()
  const country = sortedcountries.shift()
  if (!country) throw new ReferenceError('Unable to find any country for max challenge')

  return {
    _type: 'max-challenge',
    accessorId,
    country: country.isoCode,
  }
}

const getMinChallenge = (): MinChallenge => {
  const { accessorId, sortedcountries } = getSortedRanking()
  const country = sortedcountries.pop()
  if (!country) throw new ReferenceError('Unable to find any country for min challenge')

  return {
    _type: 'min-challenge',
    accessorId,
    country: country.isoCode,
  }
}

const getMembershipChallenge = (): MembershipChallenge => {
  const organization = shuffleArray(Object.keys(OrganizationVector)).shift()
  if (!isOrganizationKey(organization))
    throw new ReferenceError(`Organization is undefined in Membership challenge`)
  const relevantRegions = organizationRegions[organization]

  const possibleExceptions = Object.values(COUNTRIES).filter(country => {
    return relevantRegions.includes(country.region)
  })

  const exception = shuffleArray(possibleExceptions).shift()
  if (!exception) throw new ReferenceError(`Failed to get exception for membership challenge`)

  return {
    _type: 'membership-challenge',
    organization,
    exception: exception.isoCode,
  }
}

const getLeadershipChallenge = (): LeadershipChallenge => {
  const country = shuffleArray(Object.values(COUNTRIES)).find(country => {
    return !!country.government.leader
  })

  if (!country) throw new ReferenceError(`Unable to find leader for leadership challenge`)

  return {
    _type: 'leadership-challenge',
    country: country.isoCode,
  }
}
