import { COUNTRIES } from '~~/data/countries.gen'
import { CURRENCIES } from '~~/data/currencies.gen'
import type { CurrencyCode } from '~~/types/currency.type'
import type { ISOCountryCode } from '~~/types/geography.types'
import { mentionsCountry } from './country'

/**
 * Currency symbols for the Money Match gate — the data only carries 3-letter
 * ISO codes (JPY, USD…), so this maps the common ones to a glyph for the
 * typographic hero. Falls back to the code when there's no distinctive symbol.
 */
const CURRENCY_SYMBOLS: Partial<Record<CurrencyCode, string>> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  INR: '₹',
  NGN: '₦',
  KRW: '₩',
  RUB: '₽',
  TRY: '₺',
  BRL: 'R$',
  CHF: '₣',
  ZAR: 'R',
  THB: '฿',
  ILS: '₪',
  PHP: '₱',
  VND: '₫',
  UAH: '₴',
  PLN: 'zł',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  CZK: 'Kč',
  BDT: '৳',
  KZT: '₸',
  LAK: '₭',
  MNT: '₮',
  PYG: '₲',
  CRC: '₡',
  GHS: '₵',
}

/** A display glyph for a currency code, or the code itself if none is known. */
export const currencySymbol = (code?: CurrencyCode): string =>
  (code && CURRENCY_SYMBOLS[code]) || code || '¤'

/** The currency's local name ("SEK" → "Swedish krona"), or the code if unknown. */
export const currencyName = (code?: CurrencyCode): string =>
  (code && CURRENCIES[code].name) || code || 'currency'

/** Every country where the currency is legal tender — the same roster the
 *  shared-currency answer carve-out accepts (isCorrectIndividualAnswer). */
export const countriesSpending = (code?: CurrencyCode): ISOCountryCode[] =>
  code
    ? Object.values(COUNTRIES)
        .filter(country => country.currency === code)
        .map(country => country.isoCode)
    : []

/**
 * Does the currency's name betray an accepted answer? "Danish krone" names
 * Denmark outright — and since the shared-currency carve-out accepts ANY
 * spender, "Australian dollar" dealt for Kiribati is the same giveaway.
 * Written questions naming the currency must pass this gate.
 */
export const currencyNamesASpender = (code?: CurrencyCode): boolean => {
  if (!code) return false
  const name = currencyName(code)
  return countriesSpending(code).some(isoCode => mentionsCountry(name, isoCode))
}
