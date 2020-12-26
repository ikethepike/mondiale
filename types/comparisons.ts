import { Country } from './geography'
import { countries } from '../george/compiled/countries.json'

const neutral = [
  'economics.militarySpending',
  'economics.gdpPerCapita',
  'economics.populationBelowPovertyLine',
  'geography.area.land',
  'geography.area.water',
  'geography.area.total',
  'geography.area.arable',
  'geography.area.forested',
  'geography.elevation.lowest',
  'geography.elevation.highest',
  'geography.capital.name',
  'geography.capital.population',
  'unemployment.youth',
  'unemployment.total',
  'infrastructure.length.road',
  'infrastructure.length.rail',
  'infrastructure.electricity.populationWithoutAcess',
  'religion.atheismAgnosticism',
  'religion.believers',
  'population.total',
  'population.vulnerableGroups.minority',
  'population.vulnerableGroups.refugees',
  'environment.emissions.rank',
  'environment.emissions.megatons',
  'environment.crudeOilConsumption.rank',
  'environment.crudeOilConsumption.cubicMeters',
  'environment.energyBreakdownPercent.fossilFuels',
  'environment.energyBreakdownPercent.nuclearFuels',
  'environment.energyBreakdownPercent.renewableSources',
  'health.obesity.rank',
  'health.obesity.percentageofAdults',
  'health.access.doctors.value',
  'health.access.doctors.units',
  'health.access.hospitalBeds.value',
  'health.access.hospitalBeds.units',
  'health.lifeExpectancy',
  'health.contraceptivePrevalence',
]
const men = [
  'education.literacy.male',
  'education.averageEducation.male',
  'health.ageDistribution',
]
const women = [
  'education.literacy.female',
  'education.averageEducation.female',
  'health.ageDistribution',
  'health.childrenPerWomen',
  'health.meanAgeOfBirth',
]
const gendered = [...men, ...women]

type ComparisonType = 'men' | 'women' | 'neutral' | 'gendered'
export const comparisons: { [key in ComparisonType]: string[] } = {
  men,
  women,
  neutral,
  gendered,
}

export const generateComparisons = (type: ComparisonType) => {
  const available = comparisons[type]
  const comparison = available[Math.floor(Math.random() * available.length)]
  const dimensions = comparison.split('.')

  const countries = countries.filter(country => {
    let branch = country
    return dimensions.every((dimension) => {
      if (!Object.hasOwnProperty.call(country, dimension)) {
        return false
      }
      branch = branch[dimension]
    })
  })

  return {
    countries,
    comparison,
  }
}
