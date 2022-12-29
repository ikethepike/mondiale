import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { ChallengeConfiguration, ChallengeMarkers } from '~~/types/challenge.type'
import {
  GroupChallengeAccessorId,
  GROUP_CHALLENGES,
} from '~~/types/challenges/group-challenge.type'
import {
  IndividualChallenge,
  IndividualChallengeAccessorId,
} from '~~/types/challenges/individual-challenge.type'
import { Game } from '~~/types/game.types'
import { Amount, ISOCountryCode } from '~~/types/geography.types'
import { shuffleArray } from './arrays'
import { getRandomISOCountryCode } from './country'
import { getValueByAccessorID } from './values'

const MAXIMUM_SCORE_PER_COUNTRY = 3
const DEFAULT_CHALLENGE_MARKERS: ChallengeMarkers = {
  most: 'Most',
  least: 'Least',
}

export const getGroupChallenge = ({ game }: { game: Game }) => {
  const challenges = Object.values(GROUP_CHALLENGES)
  const challenge = challenges[Math.floor(Math.random() * challenges.length)]

  const codesArray = [...ISOCountryCodes]
  const isoCodes = shuffleArray<ISOCountryCode>(codesArray).filter(ISOCountryCode => {
    const value = getValueByAccessorID(ISOCountryCode, challenge.id)
    return !!value
  })

  for (const playerId of Object.keys(game.players)) {
    challenge.countriesPerPlayer[playerId] = isoCodes.splice(0, 5)
  }

  return challenge
}

export const getIndividualChallenge = ({
  accessorId,
}: {
  accessorId: IndividualChallengeAccessorId
}): IndividualChallenge => {
  const individualChallenge: IndividualChallenge = {
    _type: 'individual-challenge',
    id: accessorId,
    country: getRandomISOCountryCode(),
  }

  return individualChallenge
}

/**
 * Returns client side challenge details like question copy and presentational attributes
 */
export const getChallengeDetails = (
  accessorID: IndividualChallengeAccessorId | GroupChallengeAccessorId
): ChallengeConfiguration => {
  const challenges: {
    [key in IndividualChallengeAccessorId | GroupChallengeAccessorId]: ChallengeConfiguration
  } = {
    'economics.gdpPerCapita': {
      topic: 'economics',
      phrasing: 'Rank the following countries by GDP per capita',
      markers: DEFAULT_CHALLENGE_MARKERS,
    },
    'economics.militarySpending': {
      topic: 'economics',
      phrasing: 'Rank these countries by military spending',
      markers: DEFAULT_CHALLENGE_MARKERS,
    },
    'economics.populationBelowPovertyLine': {
      topic: 'economics',
      phrasing: 'Rank the following countries by the proportion of people under the poverty line',
      markers: DEFAULT_CHALLENGE_MARKERS,
    },
    'economics.equality': {
      topic: 'economics',
      phrasing: 'Rank these countries by the level of economic inequality',
      markers: {
        most: 'unequal',
        least: 'equal',
      },
    },
    'geography.area.land': {
      topic: 'geography',
      phrasing: 'Rank these countries by land area',
      markers: {
        most: 'largest area',
        least: 'smallest area',
      },
    },
    'geography.area.water': {
      topic: 'geography',
      phrasing: 'Rank these countries by amount of surface water',
      markers: {
        most: 'largest area',
        least: 'smallest area',
      },
    },
    'geography.area.total': {
      topic: 'geography',
      phrasing: 'Rank these countries by land area',
      markers: {
        most: 'largest area',
        least: 'smallest area',
      },
    },
    'geography.area.arable': {
      topic: 'geography',
      phrasing: 'Rank these countries by area of arable land',
      markers: {
        most: 'largest area',
        least: 'smallest area',
      },
    },
    'geography.area.forested': {
      topic: 'geography',
      phrasing: 'Rank these countries by area of forested land',
      markers: {
        most: 'largest area',
        least: 'smallest area',
      },
    },
    'geography.highestPeak': {
      topic: 'geography',
      phrasing: 'Rank these countries by highest mountain',
      markers: {
        most: 'highest mountain',
        least: 'shortest mountain',
      },
    },
    'unemployment.youth': {
      topic: 'unemployment',
      phrasing: 'Rank these countries by levels of youth unemployment',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'unemployment.total': {
      topic: 'unemployment',
      phrasing: 'Rank these countries by levels of unemployment',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'infrastructure.roads': {
      topic: 'infrastructure',
      phrasing: 'Rank these countries by roadways (paved and unpaved)',
      markers: {
        most: 'most kilometers',
        least: 'fewest kilometers',
      },
    },
    'infrastructure.rail': {
      topic: 'infrastructure',
      phrasing: 'Rank these countries by railways',
      markers: {
        most: 'most kilometers',
        least: 'fewest kilometers',
      },
    },
    'infrastructure.electricityAccess': {
      topic: 'infrastructure',
      phrasing: 'Rank these countries by access to electricity', // ! TO DO: think about how to do with countries at 100%
      markers: DEFAULT_CHALLENGE_MARKERS, // Add arrows here
    },
    'gender.womenInParliament': {
      topic: 'gender',
      phrasing: 'Rank these countries by women in parliament',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'gender.motherMeanAgeAtBirth': {
      topic: 'gender',
      phrasing: 'Rank these countries by the mean age of birth at which women give birth',
      markers: {
        most: 'oldest',
        least: 'youngest',
      },
    },
    'people.obesity': {
      topic: 'people',
      phrasing: 'Rank these countries by obesity',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'people.lifeExpectancy': {
      topic: 'people',
      phrasing: 'Rank these countries by average life expectancy at birth',
      markers: {
        most: 'oldest',
        least: 'youngest',
      },
    },
    'people.medianAge': {
      topic: 'people',
      phrasing: 'Rank these countries by median age',
      markers: {
        most: 'oldest',
        least: 'youngest',
      },
    },
    'people.childrenPerWoman': {
      topic: 'people',
      phrasing: 'Rank these countries by the average number of children per women',
      markers: {
        most: 'most children',
        least: 'fewest children',
      },
    },
    'education.literacy': {
      topic: 'education',
      phrasing: 'Rank these countries by literacy',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'education.averageYearsOfStudy': {
      topic: 'education',
      phrasing: 'Rank these countries by average years of study',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'health.doctors': {
      topic: 'health',
      phrasing: 'Rank these countries by number of doctors per capita',
      markers: {
        most: 'most doctors',
        least: 'fewest doctors',
      },
    },
    'health.hospitalBeds': {
      topic: 'health',
      phrasing: 'Rank these countries by number of hospital beds per capita',
      markers: {
        most: 'most beds',
        least: 'fewest beds',
      },
    },
    'health.accessToContraceptives': {
      topic: 'health',
      phrasing: 'Rank these countries by access to contraceptives',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'religion.atheism': {
      topic: 'religion',
      phrasing: 'Rank these countries by atheism',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'religion.believers': {
      topic: 'religion',
      phrasing: 'Rank these countries by believers (of any religion)',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'environment.CO2Emissions': {
      topic: 'environment',
      phrasing: 'Rank these countries by CO2 emissions',
      markers: {
        most: 'highest CO2 emissions',
        least: 'lowest CO2 emissions',
      },
    },
    'environment.renewables': {
      topic: 'environment',
      phrasing: 'Rank these countries by percent renewable energy in their national energy mix',
      markers: {
        most: 'highest percent',
        least: 'lowest percent',
      },
    },
    'humanRights.gayMarriageLegalized': {
      topic: 'human rights',
      phrasing: 'Rank these countries by year gay marriage was legalized',
      markers: {
        most: 'latest',
        least: 'earliest',
      },
    },
    // Individual challenges
    'capital.name': {
      topic: 'general knowledge',
      phrasing: 'What country has {capital} as its capital?',
    },
    flag: {
      topic: 'general knowledge',
      phrasing: 'Which country does this flag represent?',
    },
    isoCode: {
      topic: 'general knowledge',
      phrasing: 'Where on the map is {countryName}?',
    },
    'infrastructure.internetAccess': {
      topic: 'infrastructure',
      phrasing: 'Rank these countries by internet access',
    },
    'people.population': {
      topic: 'people',
      phrasing: 'Which of these countries have the largest populations?',
    },
    'people.populationGrowthRate': {
      topic: 'people',
      phrasing: 'Rank the following by population growth rate',
    },
    'health.lifeExpectancy': {
      topic: 'health',
      phrasing: 'Rank the following by life expectancy.',
    },
    'health.tobaccoUse': {
      topic: 'health',
      phrasing: 'Rank the following by tobacco use',
    },
    'health.alcoholConsumption': {
      topic: 'health',
      phrasing: 'Rank the following by alcohol consumption',
    },
    'humanRights.refugees': {
      topic: 'human rights',
      phrasing: 'Rank the following countries by their refugee populations',
    },
  }

  return challenges[accessorID]
}

export const getCorrectRanking = ({
  groupChallengeAccessorId,
  isoCodes,
}: {
  groupChallengeAccessorId: GroupChallengeAccessorId
  isoCodes: ISOCountryCode[]
}) => {
  const amounts: { value: Amount<any>; isoCode: ISOCountryCode }[] = []
  for (const isoCode of isoCodes) {
    const amount = getValueByAccessorID(isoCode, groupChallengeAccessorId)
    if (!amount) {
      console.warn('Unfiltered amount found', groupChallengeAccessorId, isoCode)
      continue
    }

    amounts.push({ value: amount, isoCode })
  }

  const sorted = amounts.sort((a, b) => b.value.amount - a.value.amount)

  return sorted.map(value => value.isoCode)
}

export const scoreChallengeSubmission = ({
  groupChallengeAccessorId,
  submittedRanking,
}: {
  groupChallengeAccessorId: GroupChallengeAccessorId
  submittedRanking: ISOCountryCode[]
}): {
  scored: number
  maximum: number
} => {
  let accruedPoints = 0
  const correctRanking = getCorrectRanking({ groupChallengeAccessorId, isoCodes: submittedRanking })
  for (const [index, isoCode] of correctRanking.entries()) {
    for (let offset = 0; offset < MAXIMUM_SCORE_PER_COUNTRY; offset++) {
      const points = MAXIMUM_SCORE_PER_COUNTRY - offset
      const earlier = submittedRanking[index - offset]
      if (earlier === isoCode) {
        accruedPoints += points
        break
      }

      if (index === 0) {
        continue
      }

      const later = submittedRanking[index + offset]
      if (later === isoCode) {
        accruedPoints += points
        break
      }
    }
  }

  return {
    scored: accruedPoints,
    maximum: submittedRanking.length * MAXIMUM_SCORE_PER_COUNTRY,
  }
}
