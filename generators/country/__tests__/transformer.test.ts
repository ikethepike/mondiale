import { describe, expect, test } from 'bun:test'
import { CountryDataTransformer } from '../transformer'
import type { FactbookResponse } from '../../../types/response.type'
import type { ISOCountryCode } from '../../../types/geography.types'

describe('CountryDataTransformer', () => {
  const transformer = new CountryDataTransformer({
    briMembers: ['US', 'GB'],
    conflicts: {
      US: { conflicts: 5 },
      GB: { conflicts: 2 },
    },
    flags: {
      US: 'us.svg',
      GB: 'gb.svg',
    },
    marriageRights: {
      US: { yearAllowed: 2015 },
      GB: { yearAllowed: 2014 },
    },
  })

  const baseResponse: FactbookResponse = {
    Government: {
      'Country name': {
        'conventional short form': { text: 'United States' },
        'conventional long form': { text: 'United States of America' },
      },
      Capital: {
        name: { text: 'Washington, DC' },
      },
      'Executive branch': {
        'chief of state': { text: 'President Joe BIDEN' },
      },
    },
    Geography: {
      'Map references': { text: 'North America' },
      Area: {
        total: { text: '0 sq km' },
        land: { text: '0 sq km' },
        water: { text: '0 sq km' },
      },
    },
    Economy: {},
    'People and Society': {
      Population: { text: '0' },
    },
    Environment: {},
    Transportation: {
      Roadways: { total: { text: '0 km' } },
      Railways: { total: { text: '0 km' } },
    },
  }

  describe('transform', () => {
    test('should transform basic country data correctly', () => {
      const response: FactbookResponse = {
        ...baseResponse,
        Government: {
          'Country name': {
            'conventional short form': { text: 'United States' },
            'conventional long form': { text: 'United States of America' },
            'local short form': { text: 'America' },
            'local long form': { text: 'United States of America' },
          },
          Capital: {
            name: { text: 'Washington, DC' },
          },
          'Executive branch': {
            'chief of state': { text: 'President Joe BIDEN' },
          },
        },
        Geography: {
          'Map references': { text: 'North America' },
          'Geographic coordinates': { text: '38 00 N, 97 00 W' },
          Area: {
            total: { text: '9,833,517 sq km' },
            land: { text: '9,147,593 sq km' },
            water: { text: '685,924 sq km' },
          },
        },
        Economy: {
          'Real GDP per capita': {
            '2020': { text: '$63,544' },
          },
          'Inflation rate (consumer prices)': {
            '2020': { text: '1.2%' },
          },
        },
        'People and Society': {
          Population: { text: '337,341,954' },
          'Life expectancy at birth': {
            'total population': { text: '80.2 years' },
          },
        },
        Environment: {
          'Air pollutants': {
            'carbon dioxide emissions': { text: '5.01 billion Mt' },
          },
        },
      }

      const result = transformer.transform(response, 'US' as ISOCountryCode)

      expect(result.name.english).toBe('United States')
      expect(result.name.local).toBe('America')
      expect(result.isoCode).toBe('US')
      expect(result.flag).toBe('us.svg')
      expect(result.coordinates).toBe('38 00 N, 97 00 W')
      expect(result.region).toBe('north-america')

      // Verify economics data
      expect(result.economics.gdpPerCapita?.amount).toBe(63544)
      expect(result.economics.gdpPerCapita?.unit).toBe('$')
      expect(result.economics.inflation?.amount).toBe(1.2)
      expect(result.economics.inflation?.unit).toBe('%')

      // Verify geography data
      if (result.geography.area.total) {
        expect(result.geography.area.total.amount).toBe(9833517)
        expect(result.geography.area.total.unit).toBe('km²')
      }
      expect(result.geography.capital?.name).toBe('Washington, DC')

      // Verify membership
      expect(result.membership).toContain('bri')
    })

    test('should handle missing data gracefully', () => {
      const response: FactbookResponse = {
        ...baseResponse,
        Economy: {},
      }

      const result = transformer.transform(response, 'US' as ISOCountryCode)

      expect(result.name.english).toBe('United States')
      expect(result.economics).toEqual({})
      expect(result.geography.area).toEqual({})
    })

    test('should handle special number formats', () => {
      const response: FactbookResponse = {
        ...baseResponse,
        Geography: {
          'Map references': { text: 'Test' },
          Area: {
            total: { text: '1,234,567.89 sq km' },
            land: { text: '1,000,000 sq km' },
            water: { text: '234,567.89 sq km' },
          },
        },
        Economy: {
          'Real GDP per capita': {
            '2020': { text: '$1,234.56' },
          },
          'Inflation rate (consumer prices)': {
            '2020': { text: '-1.2%' },
          },
        },
      }

      const result = transformer.transform(response, 'US' as ISOCountryCode)

      if (result.geography.area.total) {
        expect(result.geography.area.total.amount).toBe(1234567.89)
      }
      expect(result.economics.gdpPerCapita?.amount).toBe(1234.56)
      expect(result.economics.inflation?.amount).toBe(-1.2)
    })

    test('should handle marriage rights data', () => {
      const response: FactbookResponse = {
        ...baseResponse,
      }

      const result = transformer.transform(response, 'US' as ISOCountryCode)

      expect(result.humanRights?.gayMarriageLegalized?.year).toBe(2015)
    })

    test('should handle military conflicts data', () => {
      const response: FactbookResponse = {
        ...baseResponse,
      }

      const result = transformer.transform(response, 'US' as ISOCountryCode)

      expect(result.government.amountOfMilitaryConflicts).toBe(5)
    })
  })
})
