import { accessorTopicLabel, getScaleProps } from '~~/lib/challenges'
import type { ScalePlotProps } from '~~/lib/challenges'
import { formatNumber } from '~~/lib/number'
import { getValueByAccessorID } from '~~/lib/values'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

export interface AtlasFact {
  label: string
  value: string
  /** Present for bounded indices — plot on a ScalePlot. */
  scale?: ScalePlotProps
}

export interface AtlasSection {
  heading: string
  accessors: GroupChallengeAccessorId[]
}

/** The fact sheet, grouped. Any accessor with no data is skipped at render. */
export const ATLAS_SECTIONS: AtlasSection[] = [
  {
    heading: 'People',
    accessors: [
      'people.population',
      'people.lifeExpectancy',
      'people.medianAge',
      'people.childrenPerWoman',
      'people.populationGrowthRate',
      'people.birthRate',
      'people.netMigration',
      'people.urbanization',
    ],
  },
  {
    heading: 'Economy',
    accessors: [
      'economics.gdpPerCapita',
      'economics.gdpTotal',
      'economics.gdpGrowth',
      'economics.inflation',
      'economics.publicDebt',
      'economics.populationBelowPovertyLine',
      'unemployment.total',
      'unemployment.youth',
    ],
  },
  {
    heading: 'Governance',
    accessors: [
      'government.democracyIndex',
      'government.corruptionIndex',
      'government.humanDevelopmentIndex',
      'government.happiness',
      'economics.equality',
    ],
  },
  {
    heading: 'Geography',
    accessors: [
      'geography.area.total',
      'geography.area.arable',
      'geography.area.forested',
      'geography.highestPeak',
    ],
  },
  {
    heading: 'Society',
    accessors: [
      'education.literacy',
      'education.averageYearsOfStudy',
      'gender.womenInParliament',
      'health.doctors',
      'health.obesity',
    ],
  },
  {
    heading: 'Connectivity & environment',
    accessors: [
      'infrastructure.internetAccess',
      'infrastructure.mobileSubscriptions',
      'infrastructure.airports',
      'energy.electricityAccess',
      'energy.fossilFuels',
      'environment.CO2Emissions',
      'environment.methaneEmissions',
      'environment.renewables',
    ],
  },
]

/** Resolve one accessor into a display fact for a country, or undefined. */
export const atlasFact = (
  isoCode: ISOCountryCode,
  accessorId: GroupChallengeAccessorId
): AtlasFact | undefined => {
  const amount = getValueByAccessorID(isoCode, accessorId)
  if (!amount) return undefined

  const value = `${formatNumber(amount.amount)}${amount.unit ? ` ${amount.unit}` : ''}`

  return {
    label: accessorTopicLabel(accessorId),
    value,
    scale: getScaleProps(accessorId, amount.amount),
  }
}
