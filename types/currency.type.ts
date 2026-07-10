import type { CURRENCIES } from '~~/data/currencies.gen'

export interface CurrencyEntry {
  /** Currency name (from Wikidata labels), e.g. "United States dollar". */
  name: string
  /** Public path of the banknote image, when one exists on Commons. */
  image?: string
}

/** Open mapping the generator writes into — arbitrary ISO 4217 codes. */
export type CurrencyMapping = { [code: string]: CurrencyEntry }

/**
 * The ISO 4217 codes actually present in the dataset, derived from the
 * generated currency data (the currencies counterpart of ISOCountryCode).
 */
export type CurrencyCode = keyof typeof CURRENCIES
