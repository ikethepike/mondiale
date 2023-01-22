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
import { Amount, ISOCountryCode, isValidISOCode, Region } from '~~/types/geography.types'
import { CountryColorGrouping } from '~~/types/map.type'
import {
  isOrganizationKey,
  organizationRegions,
  OrganizationVector,
} from '~~/types/organization.type'
import { shuffleArray } from '../arrays'
import { getChallengeDetails } from '../challenges'
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
const getSortedRanking = (accessorId?: MinMaxAccessorKeys) => {
  accessorId = accessorId || minMaxAccessors[Math.floor(minMaxAccessors.length * Math.random())]

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
    hints: shuffleArray(sortedcountries.slice(0, 5).flatMap(country => country.isoCode)),
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
    hints: shuffleArray(sortedcountries.slice(-5).flatMap(country => country.isoCode)),
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

export const getFinalChallengeDetails = ({
  challenge,
}: {
  challenge:
    | RegionChallenge
    | MinChallenge
    | MaxChallenge
    | LanguageChallenge
    | MembershipChallenge
    | LeadershipChallenge
}): { question: string } => {
  switch (challenge._type) {
    case 'language-challenge':
      return {
        question: `Select a country that speaks ${challenge.language}`,
      }
    case 'leadership-challenge': {
      const countries = Object.values(COUNTRIES)
      const countryWithLeader = countries.find(country => {
        // Skip exceptions where no leader is set
        if (['president', 'prime minister'].some(title => title === country.government.leader)) {
          return false
        }

        return !!country.government.leader
      })

      if (!countryWithLeader) {
        throw new ReferenceError(`Unable to find any country with a leader set`)
      }

      const { leader } = countryWithLeader.government

      return {
        question: `Which country is led by ${leader}?`,
      }
    }
    case 'min-challenge':
    case 'max-challenge': {
      const { accessorId, _type } = challenge

      const { max, min } = finalChallengeMinMaxQuestion[accessorId]

      return {
        question: _type === 'max-challenge' ? max : min,
      }
    }
    case 'membership-challenge': {
      const organization = OrganizationVector[challenge.organization]

      return {
        question: `Which of the following countries is not a part of the ${organization}?`,
      }
    }
    case 'region-challenge': {
      const country = COUNTRIES[challenge.country]
      return {
        question: `Which region is ${country.name.english} a part of?`,
      }
    }
    default:
      return {
        question: `Lazy, lazy get this implemented`,
      }
  }
}

const finalChallengeMinMaxQuestion: {
  [accessor in MinMaxAccessorKeys]: { min: string; max: string }
} = {
  'economics.gdpPerCapita': {
    min: 'Select the country with the lowest GDP per capita in the world',
    max: 'Select the country with the highest GDP per capita in the world',
  },
  'economics.militarySpending': {
    min: 'Select the country with the lowest proportion of military spending in the world',
    max: 'Select the country with the highest proportion of military spending in the world',
  },
  'gender.womenInParliament': {
    max: 'Select the country with the highest proportion of women in parliament',
    min: 'Select the country with the lowest proportion of women in parliament',
  },
  'health.alcoholConsumption': {
    max: 'Select the country with the highest alcohol consumption in the world',
    min: 'Select the country with the lowest alcohol consumption in the world',
  },
  'health.obesity': {
    max: 'Select the country with the highest incidence of obesity',
    min: 'Select the country with the lowest incidence of obesity.',
  },
  'humanRights.refugees': {
    max: 'Select the country with the largest refugee population in the world',
    min: 'Select the country with the lowest refugee population in the world',
  },
  'people.population': {
    max: 'Select the most populuous country in the world',
    min: 'Select the least populuous country in the world',
  },
}

export const COLOR_CODED_REGIONS: { [region in Region]: CountryColorGrouping } = {
  asia: {
    color: 'teal',
    countries: [
      'AF',
      'AM',
      'AZ',
      'BD',
      'BT',
      'BN',
      'KH',
      'CN',
      'GE',
      'HK',
      'IN',
      'ID',
      'JP',
      'KZ',
      'KR',
      'KP',
      'KG',
      'LA',
      'MY',
      'MV',
      'MN',
      'MM',
      'NP',
      'PK',
      'PH',
      'RU',
      'SG',
      'LK',
      'TW',
      'TJ',
      'TH',
      'TL',
      'TM',
      'UA',
      'UZ',
      'VN',
    ],
  },
  europe: {
    color: 'red',
    countries: [
      'AD',
      'AL',
      'AT',
      'BA',
      'BE',
      'BG',
      'BY',
      'CH',
      'CZ',
      'DE',
      'DK',
      'EE',
      'ES',
      'FI',
      'FR',
      'GB',
      'GR',
      'HR',
      'HU',
      'IE',
      'IS',
      'IT',
      'LI',
      'LT',
      'LU',
      'LV',
      'MC',
      'MD',
      'ME',
      'MK',
      'MT',
      'NL',
      'NO',
      'PL',
      'PT',
      'RO',
      'RS',
      'SE',
      'SI',
      'SK',
      'SM',
      'VA',
      'XK',
    ],
  },
  africa: {
    color: 'tomato',
    countries: [
      'EC',
      'AO',
      'BF',
      'BI',
      'BJ',
      'BW',
      'CD',
      'CF',
      'CG',
      'CI',
      'CM',
      'CV',
      'DJ',
      'DZ',
      'EG',
      'EH',
      'ER',
      'ET',
      'GA',
      'GH',
      'GM',
      'GN',
      'GQ',
      'GW',
      'IC',
      'KE',
      'KM',
      'LR',
      'LS',
      'LY',
      'MA',
      'MG',
      'ML',
      'MR',
      'MU',
      'MW',
      'MZ',
      'NA',
      'NE',
      'NG',
      'RW',
      'SC',
      'SD',
      'SL',
      'SN',
      'SO',
      'SS',
      'ST',
      'SZ',
      'TD',
      'TG',
      'TN',
      'TZ',
      'UG',
      'ZA',
      'ZM',
      'ZW',
    ],
  },
  'north-america': {
    color: 'magenta',
    countries: [
      'AG',
      'BS',
      'BB',
      'BZ',
      'CA',
      'CR',
      'CU',
      'DM',
      'DO',
      'SV',
      'GL',
      'GD',
      'GT',
      'HT',
      'HN',
      'JM',
      'MX',
      'NI',
      'PA',
      'KN',
      'LC',
      'TT',
      'US',
    ],
  },
  oceania: {
    color: 'yellow',
    countries: ['AU', 'FJ', 'KI', 'FM', 'NR', 'NZ', 'PW', 'PG', 'SB', 'TO', 'TV', 'VU'],
  },
  'middle-east': {
    color: '#252525',
    countries: [
      'BH',
      'CY',
      'IR',
      'IQ',
      'IL',
      'JO',
      'KW',
      'LB',
      'OM',
      'PS',
      'QA',
      'SA',
      'SY',
      'TR',
      'AE',
      'YE',
    ],
  },
  'south-america': {
    color: 'crimson',
    countries: ['AR', 'GF', 'BO', 'BR', 'CL', 'CO', 'EC', 'GY', 'PY', 'PE', 'SR', 'UY', 'VE'],
  },
}
