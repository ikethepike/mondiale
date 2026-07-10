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
    amountOfMilitaryConflicts?: Amount<'conflicts'>
    /** V-Dem Electoral Democracy Index, 0–1 (higher = more democratic). */
    democracyIndex?: Amount<'index'>
    /** Transparency International CPI, 0–100 (higher = less corrupt). */
    corruptionIndex?: Amount<'score'>
    /** UNDP Human Development Index, 0–1 (higher = more developed), via OWID. */
    humanDevelopmentIndex?: Amount<'index'>
    /** World Happiness Report Cantril-ladder score, 0–10, via OWID. */
    happiness?: Amount<'score'>
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
    lifeExpectancy?: Amount<'years'>
    alcoholConsumption?: Amount<'liters of pure alcohol'>
    tobaccoUse?: Amount<'%'>
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
