import { describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { CURRENCIES } from '~~/data/currencies.gen'
import type { CurrencyCode } from '~~/types/currency.type'
import { mentionsCountry } from './country'
import { countriesSpending, currencyNamesASpender, moneyGlyph, moneyHero } from './currency'

const CODES = Object.keys(CURRENCIES) as CurrencyCode[]

describe('currencyNamesASpender', () => {
  it('flags currencies whose name betrays a spender', () => {
    expect(currencyNamesASpender('DKK')).toBe(true)
    expect(currencyNamesASpender('AUD')).toBe(true)
    // "United States" is two generic tokens — only the pair betrays it
    expect(currencyNamesASpender('USD')).toBe(true)
    // Sierra Leone's leone rides the country name itself
    expect(currencyNamesASpender('SLL')).toBe(true)
  })

  it('spares names that mark no spender', () => {
    expect(currencyNamesASpender('EUR')).toBe(false)
    expect(currencyNamesASpender('JPY')).toBe(false)
    // Named for Bolívar the man, not Venezuela — a fair question
    expect(currencyNamesASpender('VES')).toBe(false)
    expect(currencyNamesASpender(undefined)).toBe(false)
  })

  it('leaves the currency find gate a real pool to deal from', () => {
    const dealable = Object.values(COUNTRIES).filter(
      country => country.currency && !currencyNamesASpender(country.currency)
    )
    expect(dealable.length).toBeGreaterThan(20)
  })
})

describe('the Money Match hero', () => {
  it("never shows the ISO code, which opens with the spender's own ISO2", () => {
    expect(moneyGlyph('BRL')).toBe('R$')
    expect(moneyGlyph('KES')).toBeUndefined()
    for (const code of CODES) expect(moneyGlyph(code)).not.toBe(code)
  })

  it('shows no glyph that names a spender', () => {
    for (const code of CODES) {
      const glyph = moneyGlyph(code)
      if (!glyph) continue
      for (const isoCode of countriesSpending(code)) {
        expect(mentionsCountry(glyph, isoCode), `${code} ${glyph} names ${isoCode}`).toBe(false)
      }
    }
  })

  it('never deals a glyph a family of currencies shares', () => {
    const family = /dollar|pound|franc|kron|krón|\byen\b|renminbi|\bwon\b/i
    const members = CODES.filter(code => family.test(CURRENCIES[code].name))
    expect(members).toEqual(expect.arrayContaining(['USD', 'AUD', 'CAD', 'NZD', 'ISK', 'CNY']))
    for (const code of members) expect(moneyGlyph(code), code).toBeUndefined()
    for (const code of ['MXN', 'ARS', 'CLP'] as const)
      expect(moneyGlyph(code), code).toBeUndefined()
  })

  it('deals every glyph for one currency only', () => {
    const glyphs = CODES.map(moneyGlyph).filter(Boolean)
    expect(glyphs.length).toBeGreaterThan(10)
    expect(new Set(glyphs).size).toBe(glyphs.length)
  })

  it('prefers the banknote, and has nothing to show without a currency', () => {
    expect(moneyHero('SEK')).toEqual({ image: CURRENCIES.SEK.image })
    expect(moneyHero(undefined)).toBeUndefined()
  })
})
