/// <reference path="./types.d.ts" />
import { describe, expect, test } from 'bun:test'
import { CountryDataValidator } from '../validator'
import type { Country } from '../../../types/geography.types'
import type { FactbookResponse } from '../../../types/response.type'

describe('CountryDataValidator', () => {
  const validator = new CountryDataValidator()

  describe('validate', () => {
    test('should return true for valid country data', () => {
      const country: Country = {
        url: 'https://example.com',
        name: {
          english: 'Test Country',
          local: 'Test Local',
        },
        isoCode: 'US',
        flag: 'flag.svg',
        coordinates: '0,0',
        region: 'europe',
        membership: [],
        languages: ['English'],
        currency: 'USD',
        identity: {
          colors: ['#000000'],
        },
        government: {
          leader: 'Test Leader',
          amountOfMilitaryConflicts: 0,
        },
        economics: {
          inflation: {
            unit: '%',
            amount: 2.5,
            year: 2023,
          },
          gdpPerCapita: {
            unit: '$',
            amount: 50000,
            year: 2023,
          },
        },
        geography: {
          area: {
            total: {
              unit: 'km²',
              amount: 100000,
            },
          },
          capital: {
            name: 'Test City',
          },
        },
        unemployment: {
          youth: {
            unit: '%',
            amount: 10,
            year: 2023,
          },
          total: {
            unit: '%',
            amount: 5,
            year: 2023,
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

      expect(validator.validate(country)).toBe(true)
    })

    test('should return false when required fields are missing', () => {
      const invalidCountry = {
        name: {},
        isoCode: '',
      } as unknown as Country

      expect(validator.validate(invalidCountry)).toBe(false)
    })

    test('should return false when economics data is invalid', () => {
      const countryWithInvalidEconomics: Country = {
        name: {
          english: 'Test Country',
          local: 'Test Local',
        },
        isoCode: 'US',
        economics: {
          inflation: {
            unit: '%',
            amount: 'invalid' as unknown as number,
          },
        },
      } as unknown as Country

      expect(validator.validate(countryWithInvalidEconomics)).toBe(false)
    })

    test('should return false when geography data is invalid', () => {
      const countryWithInvalidGeography: Country = {
        name: {
          english: 'Test Country',
          local: 'Test Local',
        },
        isoCode: 'US',
        geography: {
          area: {
            total: {
              unit: 'invalid',
              amount: 'invalid' as unknown as number,
            },
          },
        },
      } as unknown as Country

      expect(validator.validate(countryWithInvalidGeography)).toBe(false)
    })
  })

  describe('validateResponse', () => {
    test('should return true for valid factbook response', () => {
      const response: FactbookResponse = {
        Government: {
          'Country name': {
            'conventional short form': { text: 'Test Country' },
            'conventional long form': { text: 'Test Country Long' },
            'local short form': { text: 'Test Local' },
            'local long form': { text: 'Test Local Long' },
          },
          Capital: {
            name: { text: 'Test City' },
          },
          'Executive branch': {
            'chief of state': { text: 'Test Leader' },
            'head of government': { text: 'Test Leader' },
          },
        },
        Geography: {
          'Map references': { text: 'Europe' },
          Area: {
            total: { text: '100000 sq km' },
            land: { text: '90000 sq km' },
            water: { text: '10000 sq km' },
          },
        },
        Economy: {
          'Inflation rate (consumer prices)': {
            '2023': { text: '2.5%' },
          },
          'Real GDP per capita': {
            '2023': { text: '$50000' },
          },
        },
        Transportation: {
          Roadways: {
            total: { text: '100000 km' },
          },
        },
        'People and Society': {
          Population: { text: '1000000' },
          'Life expectancy at birth': {
            'total population': { text: '80 years' },
          },
        },
        Environment: {
          'Air pollutants': {
            'carbon dioxide emissions': { text: '1000 megatons' },
          },
        },
      }

      expect(validator.validateResponse(response)).toBe(true)
    })

    test('should return false when Government section is missing', () => {
      const response = {
        Geography: {
          'Map references': { text: 'Europe' },
          Area: {
            total: { text: '100000 sq km' },
            land: { text: '90000 sq km' },
            water: { text: '10000 sq km' },
          },
        },
      } as unknown as FactbookResponse

      expect(validator.validateResponse(response)).toBe(false)
    })

    test('should return false when Geography section is missing', () => {
      const response = {
        Government: {
          'Country name': {
            'conventional short form': { text: 'Test Country' },
            'conventional long form': { text: 'Test Country Long' },
          },
          Capital: {
            name: { text: 'Test City' },
          },
          'Executive branch': {
            'chief of state': { text: 'Test Leader' },
          },
        },
      } as unknown as FactbookResponse

      expect(validator.validateResponse(response)).toBe(false)
    })

    test('should return false when Country name is missing', () => {
      const response = {
        Government: {
          Capital: {
            name: { text: 'Test City' },
          },
          'Executive branch': {
            'chief of state': { text: 'Test Leader' },
          },
        },
        Geography: {
          'Map references': { text: 'Europe' },
          Area: {
            total: { text: '100000 sq km' },
            land: { text: '90000 sq km' },
            water: { text: '10000 sq km' },
          },
        },
      } as unknown as FactbookResponse

      expect(validator.validateResponse(response)).toBe(false)
    })

    test('should return false when Map references is missing', () => {
      const response = {
        Government: {
          'Country name': {
            'conventional short form': { text: 'Test Country' },
            'conventional long form': { text: 'Test Country Long' },
          },
          Capital: {
            name: { text: 'Test City' },
          },
          'Executive branch': {
            'chief of state': { text: 'Test Leader' },
          },
        },
        Geography: {
          Area: {
            total: { text: '100000 sq km' },
            land: { text: '90000 sq km' },
            water: { text: '10000 sq km' },
          },
        },
      } as unknown as FactbookResponse

      expect(validator.validateResponse(response)).toBe(false)
    })
  })
})
