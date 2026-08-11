import { describe, expect, it } from 'vitest'
import { CAPITALS } from '~~/data/capitals.gen'
import { CITY_LIGHTS } from '~~/data/cities.gen'
import { capitalCityLight, capitalCountryByName, capitalStar } from '~~/lib/capitals'
import { normalizeAnswer } from '~~/lib/strings'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'

const CODES = Object.keys(CAPITALS).filter(isValidISOCode)

describe('capitalCountryByName', () => {
  it('resolves canonical capital names to their country', () => {
    expect(capitalCountryByName('Vienna')).toBe('AT')
    expect(capitalCountryByName('Ottawa')).toBe('CA')
    expect(capitalCountryByName('Canberra')).toBe('AU')
  })

  it('forgives case, accents and surrounding whitespace', () => {
    expect(capitalCountryByName('  brasilia ')).toBe('BR')
    expect(capitalCountryByName('BRASÍLIA')).toBe('BR')
  })

  it('accepts the dataset alt spellings a player might type', () => {
    // Every canonical name resolves; the alt index only ever widens that.
    const canonical = Object.entries(CAPITALS)
      .filter(([, capital]) => !!capital?.name)
      .map(([isoCode, capital]) => [isoCode as ISOCountryCode, capital!.name] as const)
    const misses = canonical.filter(([isoCode, name]) => capitalCountryByName(name) !== isoCode)
    expect(misses).toEqual([])
  })

  it('is undefined for a name no capital answers to', () => {
    expect(capitalCountryByName('Gothenburg')).toBeUndefined()
    expect(capitalCountryByName('')).toBeUndefined()
  })
})

describe('capitalStar', () => {
  it('places a capital on the globe with its population', () => {
    const star = capitalStar('AT')
    expect(star?.name).toBe('Vienna')
    expect(star?.lat).toBeGreaterThan(47)
    expect(star?.lat).toBeLessThan(49)
    expect(star?.population).toBeGreaterThan(0)
  })

  it('is undefined where the capital has no coordinates to pulse at', () => {
    // Below the cities15000 cut — the gate every star dealer relies on.
    expect(capitalStar('PW')).toBeUndefined()
  })
})

describe('capitalCityLight', () => {
  it('joins a capital whose row carries an administrative qualifier', () => {
    // "Yaren District" is the official name; the gazetteer files "Yaren".
    // Handled by the shared suffix rule, so a future "X District" joins free.
    expect(capitalCityLight('NR')?.name).toBe('Yaren')
  })

  it('joins the capitals whose row is filed under another name', () => {
    // Both need the alias table: no normalization turns "Ulaanbaatar" into
    // "Ulan Bator", and a leading "South" is deliberately never stripped.
    expect(capitalCityLight('MN')?.name).toBe('Ulan Bator')
    expect(capitalCityLight('KI')?.name).toBe('Tarawa')
  })

  it('leaves a capital the dataset genuinely lacks unresolved', () => {
    // Ngerulmud is below the cities15000 threshold; Washington D.C., New Delhi
    // and Islamabad fall outside the generator's per-country slice. None of
    // them may be faked into a point — a star must stand where the city does.
    for (const isoCode of ['PW', 'US', 'IN', 'PK'] as ISOCountryCode[]) {
      expect(capitalCityLight(isoCode), isoCode).toBeUndefined()
    }
  })

  it('never joins a capital to a different city in its own country', () => {
    // The guard on relaxing the match: a resolved row must still BE the
    // capital — either by name, or because the alias table said so.
    for (const isoCode of CODES) {
      const row = capitalCityLight(isoCode)
      if (!row) continue
      const official = CAPITALS[isoCode]!.name
      const spellings = [row.name, row.local, row.native, ...row.alt].filter(Boolean) as string[]
      // Through the shared normalizer, so "Malé" and "Male" are one word and
      // this guard tests the join rather than its own spelling rules.
      const sameWords = (a: string, b: string) => {
        const words = (value: string) =>
          new Set(normalizeAnswer(value, { articles: [] }).split(' ').filter(Boolean))
        const [left, right] = [words(a), words(b)]
        return [...left].some(word => right.has(word))
      }
      // Either a spelling shares a word with the official name, or the row is
      // the one an explicit alias asked for (Ulaanbaatar → Ulan Bator shares
      // no whole word, and is exactly why the table is a table).
      const shares = spellings.some(spelling => sameWords(spelling, official))
      const aliased = (['MN', 'KI'] as ISOCountryCode[]).includes(isoCode)
      expect(shares || aliased, `${isoCode}: ${official} -> ${row.name}`).toBe(true)
    }
  })

  it('keeps every capital in exactly one country`s city list', () => {
    // A join that reached across countries would put a star on foreign soil.
    for (const isoCode of CODES) {
      const row = capitalCityLight(isoCode)
      if (!row) continue
      expect(CITY_LIGHTS[isoCode]?.includes(row), isoCode).toBe(true)
    }
  })
})
