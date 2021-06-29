import { countries } from '../george/compiled/countries.json'
import { CountryCode } from './geography'
import { ExcludesUndefined } from './generics'

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

export const generateComparisons = (
  type: ComparisonType
): {
  countries: { countryCode: CountryCode; value: number }[]
  unit: string
  comparison: string
} => {
  const available = comparisons[type]
  const comparison = available[Math.floor(Math.random() * available.length)]
  const dimensions = comparison.split('.')

  let unit = '%'

  const filtered = countries
    .map((country) => {
      let branch: { [key: string]: any } | number = country
      if (
        !dimensions.every((dimension) => {
          if (!Object.hasOwnProperty.call(branch, dimension)) {
            return false
          }
          if (typeof branch !== 'number') {
            branch = branch[dimension]
          }
          return true
        })
      ) {
        return undefined
      }

      if (!country.countryCode) return undefined

      const output = {
        countryCode: country.countryCode as CountryCode,
        value: 0,
      }

      if (typeof branch === 'number') {
        output.value = branch
      }

      if (branch.value) {
        output.value = branch.value
      }

      if (branch.unit) {
        unit = branch.unit
      }

      return output
    })
    .filter(Boolean as any as ExcludesUndefined)

  return {
    unit,
    comparison,
    countries: filtered,
  }
}
