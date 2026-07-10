import { describe, expect, it } from 'vitest'
import { findCountryByName, localCountryName, searchCountriesByName } from './country'
import { getCountry } from '~~/lib/country'

const isoCodes = (query: string, limit?: number, excluded?: ReadonlySet<string>) =>
  searchCountriesByName(query, limit, excluded as ReadonlySet<never>).map(
    country => country.isoCode
  )

describe('findCountryByName', () => {
  it('resolves names regardless of case, accents and articles', () => {
    expect(findCountryByName('sweden')?.isoCode).toBe('SE')
    expect(findCountryByName('CÔTE D’IVOIRE')?.isoCode).toBe('CI')
    expect(findCountryByName('The Gambia')?.isoCode).toBe('GM')
  })

  it('accepts "Gambia" for "The Gambia" (and the other The-countries)', () => {
    expect(findCountryByName('Gambia')?.isoCode).toBe('GM')
    expect(findCountryByName('Bahamas')?.isoCode).toBe('BS')
    expect(findCountryByName('Dominican Republic')?.isoCode).toBe('DO')
  })

  it('resolves common aliases', () => {
    expect(findCountryByName('UK')?.isoCode).toBe('GB')
    expect(findCountryByName('Ivory Coast')?.isoCode).toBe('CI')
  })

  it('resolves local-language names, including co-official variants', () => {
    expect(findCountryByName('Deutschland')?.isoCode).toBe('DE')
    expect(findCountryByName('Suomi')?.isoCode).toBe('FI')
    expect(findCountryByName('Svizzera')?.isoCode).toBe('CH')
    expect(findCountryByName('Bharat')?.isoCode).toBe('IN')
  })

  it('never matches input that normalizes to nothing', () => {
    expect(findCountryByName('')).toBeUndefined()
    expect(findCountryByName('!!! 123')).toBeUndefined()
  })
})

describe('localCountryName', () => {
  it('returns the first local variant when it differs from the English name', () => {
    expect(localCountryName(getCountry('DE'))).toBe('Deutschland')
    expect(localCountryName(getCountry('CH'))).toBe('Schweiz')
  })

  it('returns nothing when the local name is the English name', () => {
    expect(localCountryName(getCountry('AU'))).toBeUndefined()
    expect(localCountryName(getCountry('GM'))).toBeUndefined()
  })
})

describe('searchCountriesByName', () => {
  it('returns nothing for empty or unmatchable queries', () => {
    expect(isoCodes('')).toEqual([])
    expect(isoCodes('   ')).toEqual([])
    expect(isoCodes('zzzzzzzzzzzz')).toEqual([])
  })

  it('ranks prefix matches ahead of substring matches', () => {
    expect(isoCodes('india')[0]).toBe('IN')
    expect(isoCodes('chin')[0]).toBe('CN')
  })

  it('ranks whole-word prefixes ahead of plain substrings', () => {
    const guinea = isoCodes('guinea')
    // Guinea itself first, then word-boundary hits like Papua New Guinea
    expect(guinea[0]).toBe('GN')
    expect(guinea).toContain('PG')
  })

  it('breaks ties toward the shorter name', () => {
    const ind = isoCodes('ind')
    expect(ind.indexOf('IN')).toBeLessThan(ind.indexOf('ID'))
  })

  it('finds countries through local-language variants', () => {
    expect(isoCodes('deutsch')[0]).toBe('DE')
    expect(isoCodes('nippon')[0]).toBe('JP')
  })

  it('forgives transpositions and missing letters without hurting exact matches', () => {
    expect(isoCodes('Swtizerland')).toContain('CH')
    expect(isoCodes('Sweeden')[0]).toBe('SE')
    expect(isoCodes('Grmany')).toContain('DE')
    expect(isoCodes('Protugal')).toContain('PT')
    // A fuzzy hit never displaces the literal match for the same letters
    expect(isoCodes('china')[0]).toBe('CN')
    expect(isoCodes('iran')[0]).toBe('IR')
  })

  it('tolerates typos mid-word while the name is still being typed', () => {
    expect(isoCodes('swtiz')).toContain('CH')
  })

  it('keeps very short queries literal', () => {
    for (const country of searchCountriesByName('chi')) {
      expect(countrySearchableNames(country)).toMatch(/chi/)
    }
  })

  it('honors the excluded set without starving the list', () => {
    const excluded = new Set(isoCodes('a', 3))
    const results = isoCodes('a', 6, excluded)
    expect(results).toHaveLength(6)
    for (const isoCode of results) expect(excluded.has(isoCode)).toBe(false)
  })

  it('caps results at the limit', () => {
    expect(isoCodes('a', 4)).toHaveLength(4)
  })
})

/** Every haystack the search can match a country through, normalized-ish. */
const countrySearchableNames = (country: {
  name: { english: string; local: string }
}): string => `${country.name.english} ${country.name.local}`.toLowerCase()
