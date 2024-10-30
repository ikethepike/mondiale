import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { GeneratorRunner } from '../runner'
import { ValidationError, FileSystemError } from '../errors'
import type { FactbookResponse } from '../../../types/response.type'
import type { ISOCountryCode } from '../../../types/geography.types'

describe('GeneratorRunner', () => {
  let runner: GeneratorRunner
  let originalFetch: typeof fetch
  let writeFileCalls: Array<{ path: string; content: string }> = []

  beforeEach(() => {
    runner = new GeneratorRunner()
    originalFetch = global.fetch
    writeFileCalls = []

    // Mock fs module
    globalThis.process.versions.node = '16.0.0'
    globalThis.require = ((id: string) => {
      if (id === 'fs') {
        return {
          writeFileSync: (path: string, content: string) => {
            writeFileCalls.push({ path, content })
          },
        }
      }
      return {}
    }) as any
  })

  afterEach(() => {
    global.fetch = originalFetch
    writeFileCalls = []
  })

  const mockFactbookResponse: FactbookResponse = {
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

  describe('run', () => {
    test('should successfully generate country data', async () => {
      global.fetch = ((input: RequestInfo | URL) => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockFactbookResponse),
        } as Response)
      }) as typeof fetch

      const result = await runner.run()

      expect(result.success).toBe(true)
      expect(Object.keys(result.countries).length > 0).toBe(true)
      expect(result.errors.length).toBe(0)

      // Verify file writes occurred
      expect(writeFileCalls.length > 0).toBe(true)
    })

    test('should handle mapping generation failure', async () => {
      global.fetch = (() => {
        throw new Error('Network error')
      }) as typeof fetch

      const result = await runner.run()

      expect(result.success).toBe(false)
      expect(result.errors[0]).toBeInstanceOf(ValidationError)
      expect(writeFileCalls.length).toBe(0)
    })

    test('should handle data fetching failure', async () => {
      let fetchCount = 0
      global.fetch = ((input: RequestInfo | URL) => {
        fetchCount++
        if (fetchCount === 1) {
          // First fetch succeeds (mapping generation)
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockFactbookResponse),
          } as Response)
        }
        // Subsequent fetches fail (country data fetching)
        throw new Error('Network error')
      }) as typeof fetch

      const result = await runner.run()

      expect(result.success).toBe(false)
      expect(result.errors.length > 0).toBe(true)
      expect(writeFileCalls.length).toBe(0)
    })

    test('should handle data transformation failure', async () => {
      global.fetch = ((input: RequestInfo | URL) => {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ...mockFactbookResponse,
              Government: {
                // Missing required fields to trigger transformation error
                'Country name': {},
              },
            }),
        } as Response)
      }) as typeof fetch

      const result = await runner.run()

      expect(result.success).toBe(false)
      expect(result.errors.some(e => e instanceof ValidationError)).toBe(true)
      expect(writeFileCalls.length).toBe(0)
    })

    test('should handle file writing failure', async () => {
      global.fetch = ((input: RequestInfo | URL) => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockFactbookResponse),
        } as Response)
      }) as typeof fetch

      // Mock fs module to throw error
      globalThis.require = ((id: string) => {
        if (id === 'fs') {
          return {
            writeFileSync: () => {
              throw new Error('Write error')
            },
          }
        }
        return {}
      }) as any

      const result = await runner.run()

      expect(result.success).toBe(false)
      expect(result.errors[0]).toBeInstanceOf(FileSystemError)
    })

    test('should process multiple countries', async () => {
      const countries = {
        US: { ...mockFactbookResponse },
        GB: {
          ...mockFactbookResponse,
          Government: {
            ...mockFactbookResponse.Government,
            'Country name': {
              'conventional short form': { text: 'United Kingdom' },
              'conventional long form': {
                text: 'United Kingdom of Great Britain and Northern Ireland',
              },
            },
          },
        },
      }

      global.fetch = ((input: RequestInfo | URL) => {
        const url = input.toString()
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(url.includes('us.json') ? countries.US : countries.GB),
        } as Response)
      }) as typeof fetch

      const result = await runner.run()

      expect(result.success).toBe(true)
      expect(Object.keys(result.countries)).toContain('US')
      expect(Object.keys(result.countries)).toContain('GB')
      expect(result.countries.US.name.english).toBe('United States')
      expect(result.countries.GB.name.english).toBe('United Kingdom')
    })

    test('should continue processing despite individual country failures', async () => {
      let fetchCount = 0
      global.fetch = ((input: RequestInfo | URL) => {
        fetchCount++
        if (fetchCount % 2 === 0) {
          throw new Error('Network error')
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockFactbookResponse),
        } as Response)
      }) as typeof fetch

      const result = await runner.run()

      expect(result.success).toBe(true)
      expect(Object.keys(result.countries).length > 0).toBe(true)
      expect(result.errors.length > 0).toBe(true)
    })
  })
})
