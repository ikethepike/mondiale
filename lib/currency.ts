/**
 * Currency symbols for the Money Match gate — the data only carries 3-letter
 * ISO codes (JPY, USD…), so this maps the common ones to a glyph for the
 * typographic hero. Falls back to the code when there's no distinctive symbol.
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
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
export const currencySymbol = (code?: string): string =>
  (code && CURRENCY_SYMBOLS[code]) || code || '¤'
