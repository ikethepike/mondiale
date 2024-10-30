import { describe, expect, test } from 'bun:test'
import { GeographyTransformer } from '../../transformers/geography'
import type { FactbookResponse } from '../../../../types/response.type'

describe('GeographyTransformer', () => {
  const transformer = new GeographyTransformer()

  describe('transform', () => {
    test('should transform basic geography data', () => {
      const response: FactbookResponse = {
        Geography: {
          'Map references': { text: 'North America' },
          'Geographic coordinates': { text: '38 00 N, 97 00 W' },
          Area: {
            total: { text: '9,833,517 sq km' },
            land: { text: '9,147,593 sq km' },
            water: { text: '685,924 sq km' },
          },
        },
      } as FactbookResponse

      const result = transformer.transform(response)

      expect(result.area.total?.amount).toBe(9833517)
      expect(result.area.total?.unit).toBe('km²')
      expect(result.area.land?.amount).toBe(9147593)
      expect(result.area.water?.amount).toBe(685924)
      expect(result.coordinates).toBe('38 00 N, 97 00 W')
    })

    test('should transform capital data', () => {
      const response: FactbookResponse = {
        Government: {
          Capital: {
            name: { text: 'Washington, DC' },
            'geographic coordinates': { text: '38 53 N, 77 02 W' },
          },
        },
      } as FactbookResponse

      const result = transformer.transform(response)

      expect(result.capital?.name).toBe('Washington, DC')
      expect(result.capital?.coordinates).toBe('38 53 N, 77 02 W')
    })

    test('should handle missing data', () => {
      const response: FactbookResponse = {
        Geography: {
          'Map references': { text: 'North America' },
        },
      } as FactbookResponse

      const result = transformer.transform(response)

      expect(result.area).toEqual({})
      expect(result.coordinates).toBeUndefined()
      expect(result.capital).toBeUndefined()
    })

    test('should handle malformed area data', () => {
      const response: FactbookResponse = {
        Geography: {
          Area: {
            total: { text: 'invalid' },
            land: { text: 'invalid' },
            water: { text: 'invalid' },
          },
        },
      } as FactbookResponse

      const result = transformer.transform(response)

      expect(result.area).toEqual({})
    })

    test('should handle different area units', () => {
      const response: FactbookResponse = {
        Geography: {
          Area: {
            total: { text: '9,833,517 square kilometers' },
            land: { text: '9,147,593 sq kilometers' },
            water: { text: '685,924 km2' },
          },
        },
      } as FactbookResponse

      const result = transformer.transform(response)

      expect(result.area.total?.amount).toBe(9833517)
      expect(result.area.total?.unit).toBe('km²')
      expect(result.area.land?.amount).toBe(9147593)
      expect(result.area.water?.amount).toBe(685924)
    })

    test('should handle different coordinate formats', () => {
      const response: FactbookResponse = {
        Geography: {
          'Geographic coordinates': { text: "38°00'N, 97°00'W" },
        },
      } as FactbookResponse

      const result = transformer.transform(response)

      expect(result.coordinates).toBe("38°00'N, 97°00'W")
    })
  })
})
