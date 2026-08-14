import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import type { NamedColor } from '~~/lib/palette'
import type { SourceId } from '~~/lib/attribution'
import type { CurrencyCode } from './currency.type'
import type { Organization } from './organization.type'

export interface Amount<Unit> {
  amount: number
  unit: Unit
  /** Year the figure is for; absent when the source publishes it undated. */
  year?: number
  /** Which source won this value's fallback chain — stamped by the generator,
   *  read back through `attributionFor` (lib/attribution.ts). */
  source?: SourceId
  /** Qualifier shown at reveal when the bare number needs context — stamped by
   *  the generator, so the reason travels with the value it explains. */
  note?: string
}

export const worldRegions = [
  'asia',
  'europe',
  'south-america',
  'north-america',
  'oceania',
  'africa',
  'middle-east',
] as const
export type Region = (typeof worldRegions)[number]
export const isValidContinent = (continent: unknown): continent is Region => {
  return typeof continent === 'string' && worldRegions.includes(continent as Region)
}

export interface Country {
  isoCode: ISOCountryCode
  url: string
  region: Region
  currency?: CurrencyCode
  languages: string[]
  /** The subset the country makes OFFICIAL, from the Factbook's own markers —
   *  what a round may claim officiality about. Falls back to `languages` where
   *  the source marks none, so it is never empty and never a guess. */
  officialLanguages: string[]
  coordinates: string
  name: {
    local: string
    english: string
    /** Nationality forms from the Factbook (adjective + noun, lowercased):
     *  "swiss", "dane", "spaniard"… — the giveaway scrub reads these. */
    demonyms?: string[]
  }
  identity: {
    /** Raw hex colours extracted from the flag SVG. */
    colors: string[]
    /** Colours snapped to named buckets (e.g. ["red","white"]), deduped +
     *  sorted; `[]` for emblem-heavy flags. Powers flag-palette challenges. */
    simplifiedColors: NamedColor[]
  }
  membership: Organization[]
  government: {
    leader?: string
    /** UCDP/PRIO ACD, primary warring party only (supporters excluded). */
    conflictsFought?: Amount<'conflicts'>
    /** Years since 1946 with a conflict at war intensity (≥1000 battle deaths). */
    yearsAtWar?: Amount<'years'>
    /** Distinct conflicts active in the dataset's last five years. */
    recentConflicts?: Amount<'conflicts'>
    /** V-Dem Electoral Democracy Index, 0–1 (higher = more democratic). */
    democracyIndex?: Amount<'index'>
    /** Transparency International CPI, 0–100 (higher = less corrupt). */
    corruptionIndex?: Amount<'score'>
    /** UNDP Human Development Index, 0–1 (higher = more developed), via OWID. */
    humanDevelopmentIndex?: Amount<'index'>
    /** World Happiness Report Cantril-ladder score, 0–10, via OWID. */
    happiness?: Amount<'score'>
    /** Modern independence year; ancient/unbroken statehoods stay undefined. */
    independence?: Amount<'year'>
  }
  economics: {
    inflation?: Amount<'%'>
    gdpPerCapita?: Amount<'$'>
    /** Total GDP at purchasing-power parity. */
    gdpTotal?: Amount<'$'>
    /** Annual real GDP growth rate (can be negative). */
    gdpGrowth?: Amount<'%'>
    /** Public debt as a share of GDP. */
    publicDebt?: Amount<'%'>
    /** Government budget balance, % of GDP. Positive is a surplus. */
    budgetBalance?: Amount<'%'>
    militarySpending?: Amount<'%'>
    populationBelowPovertyLine?: Amount<'%'>
    equality?: Amount<'Gini Coefficient'>
    /** International tourist arrivals per year (UNWTO via OWID). */
    touristArrivals?: Amount<'tourists'>
    /** Annual working hours per worker (Penn World Table via OWID). */
    workingHours?: Amount<'hours'>
    /** Top export commodities, in the Factbook's order (rank = value). */
    exports?: string[]
    /** Total exports of goods and services, current dollars. */
  }
  geography: {
    area: {
      land?: Amount<'km²'>
      water?: Amount<'km²'>
      total?: Amount<'km²'>
      arable?: Amount<'%'>
      forested?: Amount<'%'>
    }
    highestPeak?: Amount<'m'> & {
      name: string
    }
    capital: {
      name: string
    }
  }
  unemployment: {
    youth?: Amount<'%'>
    total?: Amount<'%'>
  }
  infrastructure: {
    rail?: Amount<'km'>
    internetAccess?: Amount<'%'>
  }
  energy: {
    /** Share of population with access to electricity. */
    electricityAccess?: Amount<'%'>
    /** Share of electricity generated from fossil fuels. */
    fossilFuels?: Amount<'%'>
    /** Primary energy consumption per person (Energy Institute via OWID). */
    consumptionPerCapita?: Amount<'kWh'>
  }
  gender: {
    womenInParliament?: Amount<'%'>
    motherMeanAgeAtBirth?: Amount<'years'>
  }
  people: {
    population?: Amount<'people'>
    lifeExpectancy?: Amount<'years'>
    medianAge?: Amount<'years'>
    childrenPerWoman?: Amount<'children'>
    populationGrowthRate?: Amount<'%'>
    /** Net migration rate per 1000 population (can be negative). */
    netMigration?: Amount<'per 1000 people'>
    birthRate?: Amount<'per 1000 people'>
    /** Share of population living in urban areas. */
    urbanization?: Amount<'%'>
    deathRate?: Amount<'per 1000 people'>
    density?: Amount<'per km²'>
    /** Share of the population aged 65 and over. */
    share65Plus?: Amount<'%'>
    /** Males per 100 females across the whole population — Gulf labor
     *  migration pushes this past 200. */
    sexRatio?: Amount<'males per 100 females'>
  }
  education: {
    literacy?: Amount<'%'>
    averageYearsOfStudy?: Amount<'years'>
  }
  health: {
    obesity?: Amount<'%'>
    doctors?: Amount<'per 1000 people'>
    hospitalBeds?: Amount<'per 1000 people'>
    accessToContraceptives?: Amount<'%'>
    alcoholConsumption?: Amount<'liters of pure alcohol'>
    tobaccoUse?: Amount<'%'>
    /** Meat supply per person per year (FAO via OWID). */
    meatConsumption?: Amount<'kg'>
    /** Mean adult male height by latest birth cohort (~1996, NCD-RisC). */
    maleHeight?: Amount<'cm'>
    /** Road-traffic death rate (WHO SDG 3.6.1, via OWID). */
    roadDeaths?: Amount<'per 100k people'>
  }
  religion: {
    atheism?: Amount<'%'>
    believers?: Amount<'%'>
  }
  environment: {
    CO2Emissions?: Amount<'megatons'>
    methaneEmissions?: Amount<'megatons'>
    renewables?: Amount<'%'>
    /** Population-weighted outdoor PM2.5 exposure. */
    airPollution?: Amount<'µg/m³'>
    /** IUCN Red List Index, 0–1 (1 = all species safe; declines ≈ everywhere). */
    redListIndex?: Amount<'index'>
    threatenedMammals?: Amount<'species'>
    /** Terrestrial protected areas as a share of land. */
    protectedLand?: Amount<'%'>
    /** Renewable internal freshwater resources per person. */
    freshwaterPerCapita?: Amount<'m³'>
    /** Share of new cars sold that are electric (IEA via OWID). */
    evSalesShare?: Amount<'%'>
  }
  humanRights: {
    gayMarriageLegalized?: Amount<'year'>
    refugees?: Amount<'people'>
  }
}

export type ISOCountryCode = (typeof ISOCountryCodes)[number]

export const isValidISOCode = (code: unknown): code is ISOCountryCode => {
  return typeof code === 'string' && ISOCountryCodes.includes(code as ISOCountryCode)
}
