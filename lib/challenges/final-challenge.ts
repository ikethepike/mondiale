import { COUNTRIES } from '~~/data/countries.gen'
import type {
  FinalChallenge,
  LanguageChallenge,
  LeadershipChallenge,
  MaxChallenge,
  MembershipChallenge,
  MinChallenge,
  MinMaxAccessorKeys,
  RegionChallenge,
} from '~~/types/challenges/final-challenge.type'
import type { Game } from '~~/types/game.types'
import {
  type Amount,
  type ISOCountryCode,
  isValidISOCode,
  type Region,
} from '~~/types/geography.types'
import type { CountryColorGrouping } from '~~/types/map.type'
import {
  isOrganizationKey,
  organizationRegions,
  OrganizationVector,
} from '~~/types/organization.type'
import { shuffleArray } from '../arrays'
import { getValueByAccessorID } from '../values'
import { REGION_LABELS, variantCountries } from '../variant'

export const getFinalChallenges = ({ game }: { game: Game }): FinalChallenge => {
  const pool = variantCountries(game.variant)

  // On a continental board "which region is X in?" answers itself — every
  // country in play shares the region. The leadership question steps in.
  const opener = () =>
    game.variant === 'world' ? getRegionChallenge(pool) : getLeadershipChallenge(pool)

  switch (game.difficulty) {
    case 'easy':
      return {
        _type: 'final-challenge',
        difficulty: 'easy',
        challenges: [opener(), getLanguageChallenge(pool)],
      }
    case 'normal': {
      const middleChallenge = Math.random() < 0.5 ? getMinChallenge(pool) : getMaxChallenge(pool)

      return {
        _type: 'final-challenge',
        difficulty: 'normal',
        challenges: [opener(), middleChallenge, getLanguageChallenge(pool)],
      }
    }

    case 'hard': {
      return {
        _type: 'final-challenge',
        difficulty: 'hard',
        challenges: [
          getLanguageChallenge(pool),
          getMaxChallenge(pool),
          getMinChallenge(pool),
          getMembershipChallenge(pool),
          getLeadershipChallenge(pool),
        ],
      }
    }
  }
}

const getRegionChallenge = (pool: ISOCountryCode[]): RegionChallenge => {
  const shuffled = shuffleArray([...pool])
  const country =
    shuffled.find(isoCode => {
      const area = COUNTRIES[isoCode].geography.area.total
      return !!area && area.amount > 400
    }) ?? shuffled[0]

  return {
    _type: 'region-challenge',
    country,
  }
}

const getLanguageChallenge = (pool: ISOCountryCode[]): LanguageChallenge => {
  const languages = pool.flatMap(isoCode => COUNTRIES[isoCode].languages)
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
const buildSortedRanking = (accessorId: MinMaxAccessorKeys, pool: ISOCountryCode[]) => {
  const sortedCountries: { amount: Amount<any>; isoCode: ISOCountryCode }[] = []

  for (const isoCode of pool) {
    if (!isValidISOCode(isoCode)) continue
    const amount = getValueByAccessorID(isoCode, accessorId)
    if (!amount) continue

    sortedCountries.push({
      amount,
      isoCode,
    })
  }

  return sortedCountries.sort((a, b) => b.amount.amount - a.amount.amount)
}

const getSortedRanking = (pool: ISOCountryCode[]) => {
  // Source data drifts between regenerations and some accessors end up
  // empty — dealing one of those would crash the final challenge mid-game
  for (const candidate of shuffleArray([...minMaxAccessors])) {
    const sortedcountries = buildSortedRanking(candidate, pool)
    if (sortedcountries.length >= 6) return { accessorId: candidate, sortedcountries }
  }

  throw new ReferenceError('No min/max accessor has enough country data')
}

const getMaxChallenge = (pool: ISOCountryCode[]): MaxChallenge => {
  const { accessorId, sortedcountries } = getSortedRanking(pool)
  const country = sortedcountries.shift()
  if (!country) throw new ReferenceError('Unable to find any country for max challenge')

  return {
    _type: 'max-challenge',
    accessorId,
    country: country.isoCode,
    hints: shuffleArray(sortedcountries.slice(0, 5).flatMap(country => country.isoCode)),
  }
}

const getMinChallenge = (pool: ISOCountryCode[]): MinChallenge => {
  const { accessorId, sortedcountries } = getSortedRanking(pool)
  const country = sortedcountries.pop()
  if (!country) throw new ReferenceError('Unable to find any country for min challenge')

  return {
    _type: 'min-challenge',
    accessorId,
    country: country.isoCode,
    hints: shuffleArray(sortedcountries.slice(-5).flatMap(country => country.isoCode)),
  }
}

const getMembershipChallenge = (pool: ISOCountryCode[]): MembershipChallenge => {
  const organization = shuffleArray(Object.keys(OrganizationVector)).shift()
  if (!isOrganizationKey(organization))
    throw new ReferenceError(`Organization is undefined in Membership challenge`)
  const relevantRegions = organizationRegions[organization]

  const poolSet = new Set(pool)
  const regionalExceptions = Object.values(COUNTRIES).filter(country => {
    return poolSet.has(country.isoCode) && relevantRegions.includes(country.region)
  })
  // Some organizations have no footprint on a continental board — fall back
  // to the organization's own regions rather than dealing nothing
  const possibleExceptions = regionalExceptions.length
    ? regionalExceptions
    : Object.values(COUNTRIES).filter(country => relevantRegions.includes(country.region))

  const exception = shuffleArray(possibleExceptions).shift()
  if (!exception) throw new ReferenceError(`Failed to get exception for membership challenge`)

  return {
    _type: 'membership-challenge',
    organization,
    exception: exception.isoCode,
  }
}

const getLeadershipChallenge = (pool: ISOCountryCode[]): LeadershipChallenge => {
  const country = shuffleArray(pool.map(isoCode => COUNTRIES[isoCode])).find(country => {
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
  variant = 'world',
}: {
  challenge:
    | RegionChallenge
    | MinChallenge
    | MaxChallenge
    | LanguageChallenge
    | MembershipChallenge
    | LeadershipChallenge
  /** The board being played — scopes min/max phrasing ("…in Europe"). */
  variant?: Game['variant']
}): { question: string } => {
  switch (challenge._type) {
    case 'language-challenge':
      return {
        question: `Select a country that speaks ${challenge.language}`,
      }
    case 'leadership-challenge': {
      // The DEALT country's leader — asking about anyone else's makes the
      // question unanswerable (validation compares against challenge.country)
      const { leader } = COUNTRIES[challenge.country].government
      return {
        question: `Which country is led by ${leader}?`,
      }
    }
    case 'min-challenge':
    case 'max-challenge': {
      const { accessorId, _type } = challenge

      const { max, min } = finalChallengeMinMaxQuestion[accessorId]
      const scope = variant === 'world' ? 'in the world' : `in ${REGION_LABELS[variant]}`

      return {
        question: `${_type === 'max-challenge' ? max : min} ${scope}`,
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

/** Short stat nouns for lesson lines and the reveal card. */
export const FINAL_STAT_LABELS: { [accessor in MinMaxAccessorKeys]: string } = {
  'economics.gdpPerCapita': 'GDP per capita',
  'economics.militarySpending': 'Military spending',
  'gender.womenInParliament': 'Women in parliament',
  'people.population': 'Population',
  'health.alcoholConsumption': 'Alcohol consumption',
  'humanRights.refugees': 'Refugees hosted',
  'health.obesity': 'Obesity rate',
}

/**
 * Question stems WITHOUT a scope — the answer pool is the variant's, so the
 * phrasing must be too ("…in Europe", not "…in the world", or China really
 * is the right answer to a Europe board's population question).
 */
const finalChallengeMinMaxQuestion: {
  [accessor in MinMaxAccessorKeys]: { min: string; max: string }
} = {
  'economics.gdpPerCapita': {
    min: 'Select the country with the lowest GDP per capita',
    max: 'Select the country with the highest GDP per capita',
  },
  'economics.militarySpending': {
    min: 'Select the country with the lowest proportion of military spending',
    max: 'Select the country with the highest proportion of military spending',
  },
  'gender.womenInParliament': {
    max: 'Select the country with the highest proportion of women in parliament',
    min: 'Select the country with the lowest proportion of women in parliament',
  },
  'health.alcoholConsumption': {
    max: 'Select the country with the highest alcohol consumption',
    min: 'Select the country with the lowest alcohol consumption',
  },
  'health.obesity': {
    max: 'Select the country with the highest incidence of obesity',
    min: 'Select the country with the lowest incidence of obesity',
  },
  'humanRights.refugees': {
    max: 'Select the country with the largest refugee population',
    min: 'Select the country with the smallest refugee population',
  },
  'people.population': {
    max: 'Select the most populous country',
    min: 'Select the least populous country',
  },
}

// Soft parchment-friendly washes, one hue family apart per region, so the
// region board reads as one harmonious map instead of a shouting match:
// asia teal · europe cornflower · africa amber · n-america lavender ·
// oceania sage · middle-east dusty rose · s-america terracotta.
export const COLOR_CODED_REGIONS: { [region in Region]: CountryColorGrouping } = {
  asia: {
    color: 'hsla(178, 36%, 50%, 0.6)',
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
    color: 'hsla(217, 52%, 62%, 0.6)',
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
    color: 'hsla(35, 70%, 60%, 0.65)',
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
    color: 'hsla(262, 32%, 62%, 0.55)',
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
    color: 'hsla(135, 32%, 52%, 0.6)',
    countries: ['AU', 'FJ', 'KI', 'FM', 'NR', 'NZ', 'PW', 'PG', 'SB', 'TO', 'TV', 'VU'],
  },
  'middle-east': {
    color: 'hsla(345, 42%, 62%, 0.6)',
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
    color: 'hsla(12, 62%, 60%, 0.62)',
    countries: ['AR', 'GF', 'BO', 'BR', 'CL', 'CO', 'EC', 'GY', 'PY', 'PE', 'SR', 'UY', 'VE'],
  },
}
