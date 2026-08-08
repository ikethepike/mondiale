import { describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { currencyNamesASpender } from './currency'

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
