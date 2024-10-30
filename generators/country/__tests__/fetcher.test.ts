import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { CountryDataFetcher } from '../fetcher'
import type { LinkMapping } from '../mapping/types'
import type { ISOCountryCode } from '../../../types/geography.types'

describe('CountryDataFetcher', () => {
  const config = {
    maxRetries: 3,
    retryDelay: 100,
  }

  const mockMapping: LinkMapping = {
    isoCode: 'US' as ISOCountryCode,
    fipsCode: 'US',
    url: 'https://github.com/factbook/factbook.json/raw/master/north-america/us.json',
    folder: 'north-america',
  }

  let fetcher: CountryDataFetcher
  let originalFetch: typeof fetch

  beforeEach(() => {
    fetcher = new CountryDataFetcher(config)
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('fetch', () => {
    test('should successfully fetch country data', async () => {
      const mockResponse = {
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

      global.fetch = ((input: RequestInfo | URL) => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      }) as typeof fetch

      const result = await fetcher.fetch(mockMapping)
      expect(result).toEqual(mockResponse)
    })

    test('should retry on failure', async () => {
      let attempts = 0
      global.fetch = ((input: RequestInfo | URL) => {
        attempts++
        if (attempts < 3) {
          throw new Error('Network error')
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
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
              Economy: {},
              'People and Society': {
                Population: { text: '0' },
              },
              Environment: {},
              Transportation: {
                Roadways: { total: { text: '0 km' } },
                Railways: { total: { text: '0 km' } },
              },
            }),
        } as Response)
      }) as typeof fetch

      const result = await fetcher.fetch(mockMapping)
      expect(attempts).toBe(3)
      expect(result.Government['Country name']['conventional short form'].text).toBe('Test')
    })

    test('should throw error after max retries', async () => {
      global.fetch = (() => {
        throw new Error('Network error')
      }) as typeof fetch

      let error: Error | undefined
      try {
        await fetcher.fetch(mockMapping)
      } catch (e) {
        error = e as Error
      }

      expect(error).toBeTruthy()
      expect(error?.message).toContain('Failed to fetch data for US')
    })

    test('should handle non-200 responses', async () => {
      global.fetch = ((input: RequestInfo | URL) => {
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        } as Response)
      }) as typeof fetch

      let error: Error | undefined
      try {
        await fetcher.fetch(mockMapping)
      } catch (e) {
        error = e as Error
      }

      expect(error).toBeTruthy()
      expect(error?.message).toContain('HTTP error!')
    })

    test('should handle invalid JSON responses', async () => {
      global.fetch = ((input: RequestInfo | URL) => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.reject(new Error('Invalid JSON')),
        } as Response)
      }) as typeof fetch

      let error: Error | undefined
      try {
        await fetcher.fetch(mockMapping)
      } catch (e) {
        error = e as Error
      }

      expect(error).toBeTruthy()
      expect(error?.message).toContain('Failed to fetch data for US')
    })
  })
})
