import type { Amount } from '../generators/country/types/amounts'
import type { Organization } from '../generators/country/types/organization'

export type Region =
  | 'asia'
  | 'europe'
  | 'south-america'
  | 'north-america'
  | 'oceania'
  | 'africa'
  | 'middle-east'

export type ISOCountryCode =
  | 'US'
  | 'GB'
  | 'FR'
  | 'DE'
  | 'IT'
  | 'ES'
  | 'PT'
  | 'GR'
  | 'IE'
  | 'NL'
  | 'BE'
  | 'LU'
  | 'CH'
  | 'AT'
  | 'SE'
  | 'NO'
  | 'DK'
  | 'FI'
  | 'IS'
  | 'RU'
  | 'AF'
  | 'AO'
  | 'AL'
  | 'AE'
  | 'AR'
  | 'AM'
  | 'AU'
  | 'BR'
  | 'CA'
  | 'CN'
  | 'HK'
  | 'TV'
  | 'AZ'
  | 'BA'
  | 'BG'
  | 'BY'
  | 'CY'
  | 'CZ'
  | 'EE'
  | 'HR'
  | 'HU'
  | 'KZ'
  | 'LT'
  | 'LV'
  | 'MD'
  | 'ME'
  | 'MK'
  | 'PL'
  | 'RO'
  | 'RS'
  | 'SI'
  | 'SK'
  | 'UA'
  | 'VA'
  | 'AD'
  | 'SM'

export type { Organization }
export type { Amount }

export function isValidISOCode(code: string): code is ISOCountryCode {
  const validCodes: Set<string> = new Set([
    'US',
    'GB',
    'FR',
    'DE',
    'IT',
    'ES',
    'PT',
    'GR',
    'IE',
    'NL',
    'BE',
    'LU',
    'CH',
    'AT',
    'SE',
    'NO',
    'DK',
    'FI',
    'IS',
    'RU',
    'AF',
    'AO',
    'AL',
    'AE',
    'AR',
    'AM',
    'AU',
    'BR',
    'CA',
    'CN',
    'HK',
    'TV',
    'AZ',
    'BA',
    'BG',
    'BY',
    'CY',
    'CZ',
    'EE',
    'HR',
    'HU',
    'KZ',
    'LT',
    'LV',
    'MD',
    'ME',
    'MK',
    'PL',
    'RO',
    'RS',
    'SI',
    'SK',
    'UA',
    'VA',
    'AD',
    'SM',
  ])
  return validCodes.has(code)
}

export interface Country {
  url: string
  name: {
    english: string
    local: string
  }
  isoCode: ISOCountryCode
  flag: string
  coordinates: string
  region: Region
  membership: Organization[]
  languages: string[]
  currency: string
  identity: {
    colors: string[]
  }
  government: {
    leader: string
    amountOfMilitaryConflicts: number
  }
  economics: {
    gdpPerCapita?: Amount<'$'>
    inflation?: Amount<'%'>
    militarySpending?: Amount<'%'>
    populationBelowPovertyLine?: Amount<'%'>
    equality?: Amount<'Gini Coefficient'>
  }
  geography: {
    area: {
      total?: Amount<'km²'>
      land?: Amount<'km²'>
      water?: Amount<'km²'>
      arable?: Amount<'%'>
      forested?: Amount<'%'>
    }
    highestPeak?: Amount<'m'> & {
      name: string
    }
    capital: {
      name: string
      coordinates?: string
    }
  }
  unemployment: {
    youth?: Amount<'%'>
    total?: Amount<'%'>
  }
  infrastructure: {
    internetAccess?: Amount<'%'>
    mobilePhones?: Amount<'per 100'>
    roads?: Amount<'km'>
    railways?: Amount<'km'>
  }
  gender: {
    motherMeanAgeAtFirstBirth?: Amount<'year'>
    femaleParliamentRepresentation?: Amount<'%'>
  }
  people: {
    population?: Amount<'people'>
    populationGrowth?: Amount<'%'>
    medianAge?: Amount<'year'>
    lifeExpectancy?: Amount<'year'>
  }
  education: {
    literacy?: Amount<'%'>
    schoolLifeExpectancy?: Amount<'year'>
  }
  health: {
    physicianDensity?: Amount<'per 1000'>
    hospitalBedDensity?: Amount<'per 1000'>
    obesity?: Amount<'%'>
    alcoholConsumption?: Amount<'liters per year'>
    tobaccoUse?: Amount<'%'>
  }
  religion: {
    mainReligions?: string[]
  }
  environment: {
    co2Emissions?: Amount<'Mt'>
    renewableEnergy?: Amount<'%'>
    forestArea?: Amount<'%'>
  }
  humanRights: {
    gayMarriageLegalized?: Amount<'year'>
    refugees?: Amount<'people'>
  }
}
