import { describe, expect, it } from 'vitest'
import {
  resolveTypedCountry,
  countryEndonym,
  findCountryByName,
  localCountryName,
  mentionsCountry,
  searchCountriesByName,
} from './country'
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

  it('resolves "or"-composite local variants (Greece)', () => {
    expect(findCountryByName('Ellas')?.isoCode).toBe('GR')
    expect(findCountryByName('Ellada')?.isoCode).toBe('GR')
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

  it('splits " or "-composites so Greece surfaces a single variant', () => {
    expect(localCountryName(getCountry('GR'))).toBe('Ellas')
  })
})

describe('countryEndonym', () => {
  it('returns the local name where it differs from the English one', () => {
    expect(countryEndonym('FI')).toBe('Suomi')
    expect(countryEndonym('DE')).toBe('Deutschland')
    expect(countryEndonym('HR')).toBe('Hrvatska')
    expect(countryEndonym('GR')).toBe('Ellas')
  })

  it('skips variants that equal the English name (India / Bharat)', () => {
    expect(countryEndonym('IN')).toBe('Bharat')
  })

  it('handles composite spacing quirks', () => {
    expect(countryEndonym('CH')).toBe('Schweiz')
    expect(countryEndonym('GQ')).toBe('Guinea Ecuatorial')
    expect(countryEndonym('BY')).toBe("Byelarus'")
  })

  it('returns nothing when the country has no distinct endonym', () => {
    expect(countryEndonym('AU')).toBeUndefined()
    expect(countryEndonym('AF')).toBeUndefined()
  })

  it('never surfaces an initialism as an endonym (DR Congo’s "RDC")', () => {
    expect(countryEndonym('CD')).toBeUndefined()
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

describe('mentionsCountry', () => {
  it('catches the country name inside a longer label', () => {
    expect(mentionsCountry('United Seychelles Party', 'SC')).toBe(true)
    expect(mentionsCountry("Cameroon People's Democratic Movement", 'CM')).toBe(true)
    expect(
      mentionsCountry('African Patriots of Senegal for Work, Ethics and Fraternity', 'SN')
    ).toBe(true)
  })

  it('catches demonyms, irregulars included', () => {
    expect(mentionsCountry('Congolese Party of Labour', 'CG')).toBe(true)
    expect(mentionsCountry("Swiss People's Party", 'CH')).toBe(true)
    expect(mentionsCountry("Spanish Socialist Workers' Party", 'ES')).toBe(true)
    expect(mentionsCountry('Dutch Republican Movement', 'NL')).toBe(true)
  })

  it('catches the local name and its derivatives', () => {
    expect(mentionsCountry('Sverigedemokraterna', 'SE')).toBe(true)
    expect(mentionsCountry('Partido Español Ficticio', 'ES')).toBe(true)
  })

  it('never trips on generic name parts or unrelated labels', () => {
    expect(mentionsCountry('United Workers Party', 'US')).toBe(false)
    expect(mentionsCountry('Labour Party', 'GB')).toBe(false)
    expect(mentionsCountry('Renaissance', 'FR')).toBe(false)
    expect(mentionsCountry('Green Party', 'DE')).toBe(false)
  })
})

/** Every haystack the search can match a country through, normalized-ish. */
const countrySearchableNames = (country: { name: { english: string; local: string } }): string =>
  `${country.name.english} ${country.name.local}`.toLowerCase()

describe('resolveTypedCountry', () => {
  it('resolves exact names, aliases and typos of the whole name', () => {
    expect(resolveTypedCountry('sweden')?.isoCode).toBe('SE')
    expect(resolveTypedCountry('swden')?.isoCode).toBe('SE')
    expect(resolveTypedCountry('Austira')?.isoCode).toBe('AT')
  })

  it('never completes a prefix', () => {
    expect(resolveTypedCountry('aus')).toBeUndefined()
    expect(resolveTypedCountry('swe')).toBeUndefined()
    expect(resolveTypedCountry('united')).toBeUndefined()
  })

  it('refuses ambiguous near-misses', () => {
    // One edit from both Iran and Iraq — no silent coin flip.
    expect(resolveTypedCountry('irak')).toBeUndefined()
    expect(resolveTypedCountry('iras')).toBeUndefined()
  })
})
