/* Questions are asked of all players, where they are tasked to rank
 * countries according to a given metric
 */

import { ISOCountryCode } from '../geography.types'

export interface GroupChallenge {
  _type: 'group-challenge'
  id: GroupChallengeAccessorId
  countriesPerPlayer: { [playerId: string]: ISOCountryCode[] }
}

export const GROUP_CHALLENGES: {
  [AccessorId in GroupChallengeAccessorId]: GroupChallenge
} = {
  'economics.gdpPerCapita': {
    _type: 'group-challenge',
    id: 'economics.gdpPerCapita',
    countriesPerPlayer: {},
  },
  'economics.militarySpending': {
    _type: 'group-challenge',
    id: 'economics.militarySpending',
    countriesPerPlayer: {},
  },
  'economics.populationBelowPovertyLine': {
    _type: 'group-challenge',
    id: 'economics.populationBelowPovertyLine',
    countriesPerPlayer: {},
  },
  'economics.equality': {
    _type: 'group-challenge',
    id: 'economics.equality',
    countriesPerPlayer: {},
  },
  'geography.area.land': {
    _type: 'group-challenge',
    id: 'geography.area.land',
    countriesPerPlayer: {},
  },
  'geography.area.water': {
    _type: 'group-challenge',
    id: 'geography.area.water',
    countriesPerPlayer: {},
  },
  'geography.area.total': {
    _type: 'group-challenge',
    id: 'geography.area.total',
    countriesPerPlayer: {},
  },
  'geography.area.arable': {
    _type: 'group-challenge',
    id: 'geography.area.arable',
    countriesPerPlayer: {},
  },
  'geography.area.forested': {
    _type: 'group-challenge',
    id: 'geography.area.forested',
    countriesPerPlayer: {},
  },
  'geography.highestPeak': {
    _type: 'group-challenge',
    id: 'geography.highestPeak',
    countriesPerPlayer: {},
  },
  'unemployment.youth': {
    _type: 'group-challenge',
    id: 'unemployment.youth',
    countriesPerPlayer: {},
  },
  'unemployment.total': {
    _type: 'group-challenge',
    id: 'unemployment.total',
    countriesPerPlayer: {},
  },
  'infrastructure.roads': {
    _type: 'group-challenge',
    id: 'infrastructure.roads',
    countriesPerPlayer: {},
  },
  'infrastructure.rail': {
    _type: 'group-challenge',
    id: 'infrastructure.rail',
    countriesPerPlayer: {},
  },
  'infrastructure.electricityAccess': {
    _type: 'group-challenge',
    id: 'infrastructure.electricityAccess',
    countriesPerPlayer: {}, // Add arrows here
  },
  'infrastructure.internetAccess': {
    _type: 'group-challenge',
    id: 'infrastructure.internetAccess',
    countriesPerPlayer: {},
  },
  'gender.womenInParliament': {
    _type: 'group-challenge',
    id: 'gender.womenInParliament',
    countriesPerPlayer: {},
  },
  'gender.motherMeanAgeAtBirth': {
    _type: 'group-challenge',
    id: 'gender.motherMeanAgeAtBirth',
    countriesPerPlayer: {},
  },
  'health.obesity': {
    _type: 'group-challenge',
    id: 'health.obesity',
    countriesPerPlayer: {},
  },
  'people.lifeExpectancy': {
    _type: 'group-challenge',
    id: 'people.lifeExpectancy',
    countriesPerPlayer: {},
  },
  'people.medianAge': {
    _type: 'group-challenge',
    id: 'people.medianAge',
    countriesPerPlayer: {},
  },
  'people.childrenPerWoman': {
    _type: 'group-challenge',
    id: 'people.childrenPerWoman',
    countriesPerPlayer: {},
  },
  'people.population': {
    _type: 'group-challenge',
    id: 'people.population',
    countriesPerPlayer: {},
  },
  'education.literacy': {
    _type: 'group-challenge',
    id: 'education.literacy',
    countriesPerPlayer: {},
  },
  'education.averageYearsOfStudy': {
    _type: 'group-challenge',
    id: 'education.averageYearsOfStudy',
    countriesPerPlayer: {},
  },
  'health.doctors': {
    _type: 'group-challenge',
    id: 'health.doctors',
    countriesPerPlayer: {},
  },
  'health.hospitalBeds': {
    _type: 'group-challenge',
    id: 'health.hospitalBeds',
    countriesPerPlayer: {},
  },
  'health.lifeExpectancy': {
    _type: 'group-challenge',
    id: 'health.hospitalBeds',
    countriesPerPlayer: {},
  },
  'health.alcoholConsumption': {
    _type: 'group-challenge',
    id: 'health.alcoholConsumption',
    countriesPerPlayer: {},
  },
  'health.tobaccoUse': {
    _type: 'group-challenge',
    id: 'health.tobaccoUse',
    countriesPerPlayer: {},
  },
  'health.accessToContraceptives': {
    _type: 'group-challenge',
    id: 'health.accessToContraceptives',
    countriesPerPlayer: {},
  },
  'religion.atheism': {
    _type: 'group-challenge',
    id: 'religion.atheism',
    countriesPerPlayer: {},
  },
  'religion.believers': {
    _type: 'group-challenge',
    id: 'religion.believers',
    countriesPerPlayer: {},
  },
  'environment.CO2Emissions': {
    _type: 'group-challenge',
    id: 'environment.CO2Emissions',
    countriesPerPlayer: {},
  },
  'environment.renewables': {
    _type: 'group-challenge',
    id: 'environment.renewables',
    countriesPerPlayer: {},
  },
  'humanRights.gayMarriageLegalized': {
    _type: 'group-challenge',
    id: 'humanRights.gayMarriageLegalized',
    countriesPerPlayer: {},
  },
  'people.populationGrowthRate': {
    _type: 'group-challenge',
    id: 'people.populationGrowthRate',
    countriesPerPlayer: {},
  },
  'humanRights.refugees': {
    _type: 'group-challenge',
    id: 'humanRights.refugees',
    countriesPerPlayer: {},
  },
} as const

export type GroupChallengeAccessorId =
  | 'economics.gdpPerCapita'
  | 'economics.militarySpending'
  | 'economics.populationBelowPovertyLine'
  | 'economics.equality'
  | 'geography.area.land'
  | 'geography.area.water'
  | 'geography.area.total'
  | 'geography.area.arable'
  | 'geography.area.forested'
  | 'geography.highestPeak'
  | 'unemployment.youth'
  | 'unemployment.total'
  | 'infrastructure.roads'
  | 'infrastructure.rail'
  | 'infrastructure.electricityAccess'
  | 'infrastructure.internetAccess'
  | 'gender.womenInParliament'
  | 'gender.motherMeanAgeAtBirth'
  | 'health.obesity'
  | 'people.lifeExpectancy'
  | 'people.medianAge'
  | 'people.childrenPerWoman'
  | 'education.literacy'
  | 'people.population'
  | 'people.populationGrowthRate'
  | 'education.averageYearsOfStudy'
  | 'health.doctors'
  | 'health.hospitalBeds'
  | 'health.accessToContraceptives'
  | 'health.lifeExpectancy'
  | 'health.tobaccoUse'
  | 'health.alcoholConsumption'
  | 'religion.atheism'
  | 'religion.believers'
  | 'environment.CO2Emissions'
  | 'environment.renewables'
  | 'humanRights.gayMarriageLegalized'
  | 'humanRights.refugees'
