import { COUNTRIES } from '~~/data/countries.gen'
import { CURRENCIES } from '~~/data/currencies.gen'
import type { CurrencyCode, MoneyHero } from '~~/types/currency.type'
import type { ISOCountryCode } from '~~/types/geography.types'
import { mentionsCountry } from './country'

/**
 * Currency glyphs for the Money Match gate — the data only carries 3-letter
 * ISO codes (JPY, USD…), so this maps the common ones to a glyph for the
 * typographic hero. Every currency wearing a listed glyph must be listed under
 * it, or a shared glyph ($, £, kr) reads as unique and deals two right answers.
 */
const CURRENCY_GLYPHS: Record<string, CurrencyCode[]> = {
  $: [
    'USD',
    'AUD',
    'BBD',
    'BSD',
    'BZD',
    'BND',
    'CAD',
    'FJD',
    'GYD',
    'HKD',
    'JMD',
    'LRD',
    'NAD',
    'NZD',
    'SBD',
    'SGD',
    'SRD',
    'TTD',
    'TWD',
    'XCD',
    'ARS',
    'CLP',
    'COP',
    'CUP',
    'DOP',
    'MXN',
    'UYU',
  ],
  '£': ['GBP', 'EGP', 'LBP', 'SDG', 'SSP', 'SYP'],
  '¥': ['JPY', 'CNY'],
  kr: ['SEK', 'NOK', 'DKK', 'ISK'],
  '₩': ['KRW', 'KPW'],
  '₣': ['CHF', 'BIF', 'CDF', 'DJF', 'GNF', 'KMF', 'RWF', 'XAF', 'XOF'],
  '€': ['EUR'],
  '₹': ['INR'],
  '₦': ['NGN'],
  '₽': ['RUB'],
  '₺': ['TRY'],
  R$: ['BRL'],
  R: ['ZAR'],
  '฿': ['THB'],
  '₪': ['ILS'],
  '₱': ['PHP'],
  '₫': ['VND'],
  '₴': ['UAH'],
  zł: ['PLN'],
  Kč: ['CZK'],
  '৳': ['BDT'],
  '₸': ['KZT'],
  '₭': ['LAK'],
  '₮': ['MNT'],
  '₲': ['PYG'],
  '₡': ['CRC'],
  '₵': ['GHS'],
}

/** The glyph a Money Match hero may show: only one no other currency wears, and
 *  never the ISO code, which mostly opens with the spender's own ISO2 (BRL, KES). */
export const moneyGlyph = (code?: CurrencyCode): string | undefined =>
  Object.entries(CURRENCY_GLYPHS).find(([, codes]) => codes.length === 1 && codes[0] === code)?.[0]

/** What the Money Match hero shows for a currency: its banknote, else its glyph. */
export const moneyHero = (code?: CurrencyCode): MoneyHero | undefined => {
  const image = code && CURRENCIES[code]?.image
  if (image) return { image }
  const glyph = moneyGlyph(code)
  return glyph ? { glyph } : undefined
}

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
