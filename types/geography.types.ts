import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import type { NamedColor } from '~~/lib/palette'
import type { CurrencyCode } from './currency.type'
import type { Organization } from './organization.type'

export interface Amount<Unit> {
  amount: number
  unit: Unit
  year?: number
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
  flag: string
  isoCode: ISOCountryCode
  url: string
  region: Region
  currency?: CurrencyCode
  languages: string[]
  coordinates: string
  name: {
    local: string
    english: string
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
    exportsTotal?: Amount<'$'>
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
    mobileSubscriptions?: Amount<'per 100 people'>
    airports?: Amount<'airports'>
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
    parisAgreement?: boolean
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

export const PotentialISOCountryCodes = [
  'AD',
  'AE',
  'AF',
  'AG',
  'AI',
  'AL',
  'AM',
  'AO',
  'AR',
  'AT',
  'AU',
  'AW',
  'AZ',
  'BA',
  'BB',
  'BD',
  'BE',
  'BF',
  'BG',
  'BH',
  'BI',
  'BJ',
  'BM',
  'BN',
  'BO',
  'BR',
  'BS',
  'BT',
  'BW',
  'BY',
  'BZ',
  'CA',
  'CD',
  'CF',
  'CG',
  'CH',
  'CI',
  'CL',
  'CM',
  'CN',
  'CO',
  'CR',
  'CU',
  'CV',
  'CW',
  'CY',
  'CZ',
  'DE',
  'DJ',
  'DK',
  'DM',
  'DO',
  'DZ',
  'EC',
  'EE',
  'EG',
  'EH',
  'ER',
  'ES',
  'ET',
  'FI',
  'FJ',
  'FK',
  'FM',
  'FO',
  'FR',
  'GA',
  'GB',
  'GD',
  'GE',
  'GF',
  'GH',
  'GL',
  'GM',
  'GN',
  'GP',
  'GQ',
  'GR',
  'GT',
  'GW',
  'GY',
  'HK',
  'HN',
  'HR',
  'HT',
  'HU',
  'IC',
  'ID',
  'IE',
  'IL',
  'IN',
  'IQ',
  'IR',
  'IS',
  'IT',
  'JM',
  'JO',
  'JP',
  'KE',
  'KG',
  'KH',
  'KI',
  'KM',
  'KN',
  'KP',
  'KR',
  'KW',
  'KY',
  'KZ',
  'LA',
  'LB',
  'LC',
  'LI',
  'LK',
  'LR',
  'LS',
  'LT',
  'LU',
  'LV',
  'LY',
  'MA',
  'MC',
  'MD',
  'ME',
  'MF',
  'MG',
  'MK',
  'ML',
  'MM',
  'MN',
  'MQ',
  'MR',
  'MS',
  'MT',
  'MU',
  'MV',
  'MW',
  'MX',
  'MY',
  'MZ',
  'NA',
  'NC',
  'NE',
  'NG',
  'NI',
  'NL',
  'NO',
  'NP',
  'NR',
  'NZ',
  'OM',
  'PA',
  'PE',
  'PF',
  'PG',
  'PH',
  'PK',
  'PL',
  'PN',
  'PR',
  'PS',
  'PT',
  'PY',
  'QA',
  'RE',
  'RO',
  'RS',
  'RU',
  'RW',
  'SA',
  'SB',
  'SC',
  'SD',
  'SE',
  'SG',
  'SI',
  'SK',
  'SL',
  'SN',
  'SO',
  'SR',
  'SS',
  'ST',
  'SV',
  'SX',
  'SY',
  'SZ',
  'TC',
  'TD',
  'TG',
  'TH',
  'TJ',
  'TL',
  'TM',
  'TN',
  'TO',
  'TR',
  'TT',
  'TW',
  'TZ',
  'UA',
  'UG',
  'PW',
  'US',
  'UY',
  'UZ',
  'VA',
  'VC',
  'VE',
  'VG',
  'VI',
  'VN',
  'VU',
  'XK',
  'YE',
  'YT',
  'ZA',
  'ZM',
  'ZW',
  'SM',
  'TV',
] as const

export type ISOCountryCode = (typeof ISOCountryCodes)[number]

export const isValidISOCode = (code: unknown): code is ISOCountryCode => {
  return typeof code === 'string' && ISOCountryCodes.includes(code as ISOCountryCode)
}
