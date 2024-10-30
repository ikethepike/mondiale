import { describe, expect, test } from 'bun:test'
import { EconomicsTransformer } from '../../transformers/economics'
import type { FactbookResponse } from '../../../../types/response.type'

describe('EconomicsTransformer', () => {
  const transformer = new EconomicsTransformer()

  const createMockResponse = (economy: Partial<FactbookResponse['Economy']>): FactbookResponse => ({
    Government: {
      'Country name': {
        'conventional short form': { text: 'Test' },
        'conventional long form': { text: 'Test Country' },
      },
      Capital: {
        name: { text: 'Test City' },
      },
      'Executive branch': {
        'chief of state': { text: 'Test Leader' },
      },
    },
    Geography: {
      'Map references': { text: 'Test' },
      Area: {
        total: { text: '0 sq km' },
        land: { text: '0 sq km' },
        water: { text: '0 sq km' },
      },
    },
    Economy: economy,
    'People and Society': {
      Population: { text: '0' },
    },
    Environment: {},
    Transportation: {
      Roadways: { total: { text: '0 km' } },
      Railways: { total: { text: '0 km' } },
    },
  })

  describe('transform', () => {
    test('should transform GDP per capita data', () => {
      const response = createMockResponse({
        'Real GDP per capita': {
          '2023': { text: '$65,000' },
        },
      })

      const result = transformer.transform(response)

      expect(result.gdpPerCapita).toBeTruthy()
      expect(result.gdpPerCapita?.amount).toBe(65000)
      expect(result.gdpPerCapita?.unit).toBe('$')
      expect(result.gdpPerCapita?.year).toBe(2023)
    })

    test('should transform inflation data', () => {
      const response = createMockResponse({
        'Inflation rate (consumer prices)': {
          '2023': { text: '2.5%' },
        },
      })

      const result = transformer.transform(response)

      expect(result.inflation).toBeTruthy()
      expect(result.inflation?.amount).toBe(2.5)
      expect(result.inflation?.unit).toBe('%')
      expect(result.inflation?.year).toBe(2023)
    })

    test('should handle negative inflation rates', () => {
      const response = createMockResponse({
        'Inflation rate (consumer prices)': {
          '2023': { text: '-0.5%' },
        },
      })

      const result = transformer.transform(response)

      expect(result.inflation).toBeTruthy()
      expect(result.inflation?.amount).toBe(-0.5)
      expect(result.inflation?.unit).toBe('%')
    })

    test('should handle missing data', () => {
      const response = createMockResponse({})

      const result = transformer.transform(response)

      expect(result.gdpPerCapita).toBeUndefined()
      expect(result.inflation).toBeUndefined()
    })

    test('should handle malformed data', () => {
      const response = createMockResponse({
        'Real GDP per capita': {
          '2023': { text: 'invalid' },
        },
        'Inflation rate (consumer prices)': {
          '2023': { text: 'invalid' },
        },
      })

      const result = transformer.transform(response)

      expect(result.gdpPerCapita).toBeUndefined()
      expect(result.inflation).toBeUndefined()
    })

    test('should handle formatted numbers', () => {
      const response = createMockResponse({
        'Real GDP per capita': {
          '2023': { text: '$65,123.45' },
        },
        'Inflation rate (consumer prices)': {
          '2023': { text: '2,345.67%' },
        },
      })

      const result = transformer.transform(response)

      expect(result.gdpPerCapita?.amount).toBe(65123.45)
      expect(result.inflation?.amount).toBe(2345.67)
    })

    test('should use most recent year when multiple years present', () => {
      const response = createMockResponse({
        'Real GDP per capita': {
          '2021': { text: '$60,000' },
          '2022': { text: '$62,000' },
          '2023': { text: '$65,000' },
        },
      })

      const result = transformer.transform(response)

      expect(result.gdpPerCapita?.amount).toBe(65000)
      expect(result.gdpPerCapita?.year).toBe(2023)
    })

    test('should handle different currency formats', () => {
      const response = createMockResponse({
        'Real GDP per capita': {
          '2023': { text: '€65,000' },
        },
      })

      const result = transformer.transform(response)

      expect(result.gdpPerCapita?.amount).toBe(65000)
      expect(result.gdpPerCapita?.unit).toBe('€')
    })
  })
})
