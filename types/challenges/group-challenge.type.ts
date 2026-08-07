/* Questions are asked of all players, where they are tasked to rank
 * countries according to a given metric
 */

import type { ISOCountryCode } from '../geography.types'

export interface GroupChallenge {
  _type: 'group-challenge'
  id: GroupChallengeAccessorId
  countriesPerPlayer: { [playerId: string]: ISOCountryCode[] }
}

/** The one list. The union and GROUP_CHALLENGES are both derived from it. */
export const GROUP_CHALLENGE_ACCESSOR_IDS = [
  'economics.gdpPerCapita',
  'economics.militarySpending',
  'economics.populationBelowPovertyLine',
  'economics.equality',
  'geography.area.land',
  'geography.area.water',
  'geography.area.total',
  'geography.area.arable',
  'geography.area.forested',
  'geography.highestPeak',
  'unemployment.youth',
  'unemployment.total',
  'infrastructure.rail',
  'infrastructure.internetAccess',
  'gender.womenInParliament',
  'gender.motherMeanAgeAtBirth',
  'health.obesity',
  'people.lifeExpectancy',
  'people.medianAge',
  'people.childrenPerWoman',
  'education.literacy',
  'people.population',
  'people.populationGrowthRate',
  'education.averageYearsOfStudy',
  'health.doctors',
  'health.hospitalBeds',
  'health.accessToContraceptives',
  'health.tobaccoUse',
  'health.alcoholConsumption',
  'religion.atheism',
  'religion.believers',
  'environment.CO2Emissions',
  'environment.renewables',
  'humanRights.gayMarriageLegalized',
  'humanRights.refugees',
  'economics.inflation',
  'government.amountOfMilitaryConflicts',
  'government.conflictsFought',
  'government.yearsAtWar',
  'government.recentConflicts',
  'government.democracyIndex',
  'government.corruptionIndex',
  'government.humanDevelopmentIndex',
  'government.happiness',
  'economics.gdpTotal',
  'economics.gdpGrowth',
  'economics.publicDebt',
  'infrastructure.mobileSubscriptions',
  'infrastructure.airports',
  'energy.electricityAccess',
  'energy.fossilFuels',
  'people.netMigration',
  'people.birthRate',
  'people.urbanization',
  'environment.methaneEmissions',
  'economics.touristArrivals',
  'economics.workingHours',
  'energy.consumptionPerCapita',
  'health.meatConsumption',
  'health.maleHeight',
  'health.roadDeaths',
  'environment.airPollution',
  'environment.redListIndex',
  'environment.threatenedMammals',
  'environment.protectedLand',
  'environment.freshwaterPerCapita',
  'environment.evSalesShare',
  'people.deathRate',
  'people.density',
  'people.share65Plus',
  'people.sexRatio',
] as const

export type GroupChallengeAccessorId = (typeof GROUP_CHALLENGE_ACCESSOR_IDS)[number]

/** Entries are module singletons — getGroupChallenge clones before dealing. */
export const GROUP_CHALLENGES: {
  [AccessorId in GroupChallengeAccessorId]: GroupChallenge
} = Object.fromEntries(
  GROUP_CHALLENGE_ACCESSOR_IDS.map(id => [
    id,
    { _type: 'group-challenge', id, countriesPerPlayer: {} },
  ])
) as { [AccessorId in GroupChallengeAccessorId]: GroupChallenge }
