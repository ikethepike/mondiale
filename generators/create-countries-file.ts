import { writeFileSync } from 'fs'
import type { Country, ISOCountryCode, Region } from '~/types/geography.types'
import type { FactbookResponse } from '~/types/response.type'
import { createTextNode, extractText, extractNestedText } from '~/types/response.type'

function mapRegion(text: string | undefined): Region {
  if (!text) return 'europe'
  const normalized = text.toLowerCase().replace(/\s+/g, '-')
  switch (normalized) {
    case 'asia':
    case 'central-asia':
    case 'east-asia':
    case 'southeast-asia':
    case 'south-asia':
      return 'asia'
    case 'europe':
      return 'europe'
    case 'south-america':
      return 'south-america'
    case 'north-america':
      return 'north-america'
    case 'australia-oceania':
      return 'oceania'
    case 'africa':
      return 'africa'
    case 'middle-east':
      return 'middle-east'
    default:
      return 'europe'
  }
}

function transformCountryData(data: FactbookResponse, isoCode: ISOCountryCode): Country {
  return {
    url: data.url || '',
    name: {
      english: extractText(data.Government['Country name']['conventional short form']) || '',
      local: extractText(data.Government['Country name']['local short form']) || '',
    },
    isoCode,
    flag: `${isoCode.toLowerCase()}.svg`,
    coordinates: extractText(data.Geography['Geographic coordinates']) || '',
    region: mapRegion(extractText(data.Geography['Map references'])),
    membership: [],
    languages: [],
    currency: '',
    identity: {
      colors: [],
    },
    government: {
      leader: extractText(data.Government['Executive branch']['chief of state']) || '',
      amountOfMilitaryConflicts: 0,
    },
    economics: {
      gdpPerCapita: {
        amount: 0,
        unit: '$',
      },
      inflation: {
        amount: 0,
        unit: '%',
      },
    },
    geography: {
      area: {
        total: {
          amount: 0,
          unit: 'km²',
        },
      },
      capital: {
        name: extractText(data.Government.Capital.name) || '',
      },
    },
    unemployment: {
      youth: {
        amount: 0,
        unit: '%',
      },
      total: {
        amount: 0,
        unit: '%',
      },
    },
    infrastructure: {},
    gender: {},
    people: {},
    education: {},
    health: {},
    religion: {},
    environment: {},
    humanRights: {},
  }
}

export function generateCountriesFile(countries: Record<ISOCountryCode, Country>): void {
  const template = `import type { Country, ISOCountryCode } from '~/types/geography.types'

export const COUNTRIES: Record<ISOCountryCode, Country> = ${JSON.stringify(countries, null, 2)}
`

  writeFileSync('data/countries.gen.ts', template)
}

export function generateISOCodesFile(isoCodes: ISOCountryCode[]): void {
  const template = `import type { ISOCountryCode } from '~/types/geography.types'

export const ISO_CODES: ISOCountryCode[] = ${JSON.stringify(isoCodes, null, 2)}
`

  writeFileSync('data/iso-codes.gen.ts', template)
}
