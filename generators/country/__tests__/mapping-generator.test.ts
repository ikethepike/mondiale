import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { MappingGenerator } from '../mapping/generator'
import type { LinkMapping } from '../mapping/types'
import { ValidationError } from '../errors'

describe('MappingGenerator', () => {
  const generator = new MappingGenerator()
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('generate', () => {
    test('should successfully generate mappings', async () => {
      global.fetch = ((input: RequestInfo | URL) => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ Government: { 'Country name': { text: 'Test' } } }),
        } as Response)
      }) as typeof fetch

      const result = await generator.generate()
      expect(result.success).toBe(true)
      expect(result.mappings.length > 0).toBe(true)
      expect(result.errors.length).toBe(0)

      // Verify mapping structure
      const firstMapping = result.mappings[0]
      expect(Object.keys(firstMapping).length).toBe(4) // isoCode, fipsCode, url, folder
      expect(
        firstMapping.url.includes('https://github.com/factbook/factbook.json/raw/master')
      ).toBe(true)
    })

    test('should handle non-sovereign territories', async () => {
      global.fetch = ((input: RequestInfo | URL) => {
        const url = input.toString()
        if (url.includes('hk.json')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                Government: {
                  'Dependency status': { text: 'special administrative region of China' },
                },
              }),
          } as Response)
        }
        return Promise.resolve({ ok: false } as Response)
      }) as typeof fetch

      const result = await generator.generate()
      const hongKongMapping = result.mappings.find(m => m.isoCode === 'HK')
      expect(hongKongMapping).toBeTruthy()
      expect(hongKongMapping?.folder).toBe('east-n-southeast-asia')
    })

    test('should handle fetch failures gracefully', async () => {
      global.fetch = (() => {
        throw new Error('Network error')
      }) as typeof fetch

      const result = await generator.generate()
      expect(result.success).toBe(false)
      expect(result.errors.length > 0).toBe(true)
      expect(result.errors[0]).toBeInstanceOf(Error)
    })

    test('should validate generated mappings', async () => {
      global.fetch = ((input: RequestInfo | URL) => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ invalid: 'data' }),
        } as Response)
      }) as typeof fetch

      const result = await generator.generate()
      const hasValidationError = result.errors.some(e => e instanceof ValidationError)
      expect(hasValidationError).toBe(true)
    })
  })

  describe('validateUrl', () => {
    test('should validate factbook URLs', async () => {
      global.fetch = ((input: RequestInfo | URL) => {
        return Promise.resolve({ ok: true } as Response)
      }) as typeof fetch

      const validUrl = 'https://github.com/factbook/factbook.json/raw/master/europe/uk.json'
      const isValid = await generator.validateUrl(validUrl)
      expect(isValid).toBe(true)
    })

    test('should reject invalid URLs', async () => {
      global.fetch = ((input: RequestInfo | URL) => {
        return Promise.resolve({ ok: false } as Response)
      }) as typeof fetch

      const invalidUrl = 'https://invalid-url.com'
      const isValid = await generator.validateUrl(invalidUrl)
      expect(isValid).toBe(false)
    })

    test('should handle network errors', async () => {
      global.fetch = (() => {
        throw new Error('Network error')
      }) as typeof fetch

      const url = 'https://github.com/factbook/factbook.json/raw/master/europe/uk.json'
      const isValid = await generator.validateUrl(url)
      expect(isValid).toBe(false)
    })
  })

  describe('mapping structure', () => {
    test('should generate correct mapping structure', async () => {
      global.fetch = ((input: RequestInfo | URL) => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ Government: { 'Country name': { text: 'Test' } } }),
        } as Response)
      }) as typeof fetch

      const result = await generator.generate()
      const mapping = result.mappings[0]

      // Verify mapping properties
      expect(Object.keys(mapping).length).toBe(4)
      expect(typeof mapping.isoCode).toBe('string')
      expect(typeof mapping.fipsCode).toBe('string')
      expect(typeof mapping.url).toBe('string')
      expect(typeof mapping.folder).toBe('string')

      // Verify URL format
      const urlPattern =
        /^https:\/\/github\.com\/factbook\/factbook\.json\/raw\/master\/[^/]+\/[^/]+\.json$/
      expect(urlPattern.test(mapping.url)).toBe(true)

      // Verify folder is one of the valid folders
      const validFolders = [
        'africa',
        'central-asia',
        'east-n-southeast-asia',
        'europe',
        'middle-east',
        'south-america',
        'central-america-n-caribbean',
        'south-asia',
        'north-america',
        'australia-oceania',
      ]
      expect(validFolders.includes(mapping.folder)).toBe(true)
    })

    test('should maintain ISO to FIPS code mapping consistency', async () => {
      global.fetch = ((input: RequestInfo | URL) => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ Government: { 'Country name': { text: 'Test' } } }),
        } as Response)
      }) as typeof fetch

      const result = await generator.generate()
      const ukMapping = result.mappings.find(m => m.isoCode === 'GB')
      expect(ukMapping?.fipsCode).toBe('UK')

      const usMapping = result.mappings.find(m => m.isoCode === 'US')
      expect(usMapping?.fipsCode).toBe('US')
    })
  })
})
