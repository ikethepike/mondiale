import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import type { Country, ISOCountryCode } from '~~/types/geography.types'
import { shuffleArray } from './arrays'
import { baseEncode } from './strings'

export const getCountry = (isoCode: ISOCountryCode): Country => COUNTRIES[isoCode]

export const countryName = (country: ISOCountryCode | Country): string =>
  typeof country === 'string' ? COUNTRIES[country].name.english : country.name.english

export const flagDataUri = (country: Country): string =>
  `data:image/svg+xml;base64,${baseEncode(country.flag)}`

// The recomposed 3:1 wide-tile flags are a ~2.8MB generated artifact, loaded
// lazily (like data/map-hd.gen) so they don't bloat the eager bundle for pages
// that never render a flag tile.
let flagsWide: Partial<Record<ISOCountryCode, string>> | null = null
let flagsWidePromise: Promise<void> | null = null

export const loadFlagsWide = (): Promise<void> => {
  if (flagsWide) return Promise.resolve()
  if (!flagsWidePromise) {
    flagsWidePromise = import('~~/data/flags-wide.gen').then(m => {
      flagsWide = m.FLAGS_WIDE
    })
  }
  return flagsWidePromise
}

/**
 * Data-URI for the wide-tile variant, or null when the flag has no recomposed
 * variant (excluded → caller should fall back to the contained original) or the
 * artifact hasn't loaded yet. Call `loadFlagsWide()` first and re-read reactively.
 */
export const flagWideDataUri = (country: Country): string | null => {
  const svg = flagsWide?.[country.isoCode]
  return svg ? `data:image/svg+xml;base64,${baseEncode(svg)}` : null
}

/**
 * Normalize free-typed country names for matching: case, diacritics
 * ("Côte d'Ivoire" → "cote divoire"), punctuation and a leading "the".
 */
export const normalizeCountryName = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '')

/** Common alternative names people actually type, mapped onto the data's ISO codes. */
const COUNTRY_ALIASES: { [alias: string]: ISOCountryCode } = {
  usa: 'US',
  us: 'US',
  america: 'US',
  'united states of america': 'US',
  uk: 'GB',
  britain: 'GB',
  'great britain': 'GB',
  england: 'GB',
  'ivory coast': 'CI',
  'czech republic': 'CZ',
  drc: 'CD',
  'dr congo': 'CD',
  'congo kinshasa': 'CD',
  congo: 'CG',
  'republic of the congo': 'CG',
  'congo brazzaville': 'CG',
  burma: 'MM',
  holland: 'NL',
  macedonia: 'MK',
  'east timor': 'TL',
  'timor leste': 'TL',
  uae: 'AE',
  emirates: 'AE',
  vatican: 'VA',
  'holy see': 'VA',
  bosnia: 'BA',
  swaziland: 'SZ',
  'cape verde': 'CV',
  korea: 'KR',
}

let nameIndex: Map<string, ISOCountryCode> | undefined
const getNameIndex = (): Map<string, ISOCountryCode> => {
  if (nameIndex) return nameIndex

  nameIndex = new Map()
  for (const country of Object.values(COUNTRIES)) {
    nameIndex.set(normalizeCountryName(country.name.english), country.isoCode)
    nameIndex.set(normalizeCountryName(country.name.local), country.isoCode)
  }
  for (const [alias, isoCode] of Object.entries(COUNTRY_ALIASES)) {
    nameIndex.set(alias, isoCode)
  }

  return nameIndex
}

/** Resolve a typed name (any casing, accents, common aliases) to a country. */
export const findCountryByName = (input: string): Country | undefined => {
  const isoCode = getNameIndex().get(normalizeCountryName(input))
  return isoCode ? COUNTRIES[isoCode] : undefined
}

/** Autocomplete: prefix matches first, then substring matches, deduped. */
export const searchCountriesByName = (query: string, limit = 6): Country[] => {
  const normalized = normalizeCountryName(query)
  if (!normalized) return []

  const prefix: ISOCountryCode[] = []
  const substring: ISOCountryCode[] = []
  for (const [name, isoCode] of getNameIndex()) {
    if (name.startsWith(normalized)) prefix.push(isoCode)
    else if (name.includes(normalized)) substring.push(isoCode)
  }

  const seen = new Set<ISOCountryCode>()
  const results: Country[] = []
  for (const isoCode of [...prefix, ...substring]) {
    if (seen.has(isoCode)) continue
    seen.add(isoCode)
    results.push(COUNTRIES[isoCode])
    if (results.length >= limit) break
  }

  return results
}

export const getRandomISOCountryCode = (modifier?: 'large' | 'small'): ISOCountryCode => {
  switch (modifier) {
    // Find larger countries to avoid users having to find tiny island nations
    case 'large': {
      const shuffledISOCodes = shuffleArray([...ISOCountryCodes])
      return (
        shuffledISOCodes.find(isoCode => {
          const country = COUNTRIES[isoCode]
          if (!country.geography.area.total) return false
          return country.geography.area.total.amount > 400
        }) || shuffledISOCodes[0]
      )
    }
    case 'small': {
      const shuffledISOCodes = shuffleArray([...ISOCountryCodes])
      return (
        shuffledISOCodes.find(isoCode => {
          const country = COUNTRIES[isoCode]
          if (!country.geography.area.total) return false
          return country.geography.area.total.amount < 400
        }) || shuffledISOCodes[0]
      )
    }
    default:
      return ISOCountryCodes[Math.floor(Math.random() * ISOCountryCodes.length)]
  }
}

export const getRandomCountry = (): Country => {
  const isoCode = getRandomISOCountryCode()
  return COUNTRIES[isoCode]
}
