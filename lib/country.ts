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

/**
 * The data's `name.local` packs co-official variants into one string
 * ("Schweiz / Suisse / Svizzera / Svizra") — split them so each is
 * individually typeable and searchable.
 */
const localNameVariants = (country: Country): string[] =>
  country.name.local
    .split('/')
    .map(variant => variant.trim())
    .filter(Boolean)

/** First local-language name, when it meaningfully differs from the English one. */
export const localCountryName = (country: Country): string | undefined => {
  const [local] = localNameVariants(country)
  if (!local || normalizeCountryName(local) === normalizeCountryName(country.name.english)) {
    return undefined
  }
  return local
}

/**
 * Some countries (France, UK…) pack every overseas territory into
 * `coordinates` as HTML. Strip tags and keep just the primary lat/long pair.
 */
export const primaryCoordinates = (country: Country): string | undefined => {
  const raw = country.coordinates
  if (!raw) return undefined
  const plain = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // First "NN NN N/S, NN NN E/W" pair.
  const match = /\d[\d\s]*[NS],\s*\d[\d\s]*[EW]/.exec(plain)
  return match ? match[0].replace(/\s+/g, ' ') : plain.split(/\s{2,}|·/)[0]
}

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

  const index = (nameIndex = new Map())
  const add = (name: string, isoCode: ISOCountryCode) => {
    const normalized = normalizeCountryName(name)
    // Names that normalize away entirely would otherwise collide on ''
    if (normalized) index.set(normalized, isoCode)
  }
  for (const country of Object.values(COUNTRIES)) {
    add(country.name.english, country.isoCode)
    for (const variant of localNameVariants(country)) add(variant, country.isoCode)
  }
  for (const [alias, isoCode] of Object.entries(COUNTRY_ALIASES)) {
    index.set(alias, isoCode)
  }

  return index
}

/** Resolve a typed name (any casing, accents, common aliases) to a country. */
export const findCountryByName = (input: string): Country | undefined => {
  const normalized = normalizeCountryName(input)
  if (!normalized) return undefined
  const isoCode = getNameIndex().get(normalized)
  return isoCode ? COUNTRIES[isoCode] : undefined
}

/**
 * Damerau–Levenshtein distance (adjacent transpositions count as one edit —
 * the typo dyslexic and fast typists actually make), capped at `max`:
 * anything beyond returns `max + 1`.
 */
const editDistance = (a: string, b: string, max: number): number => {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1

  let twoAgo: number[] = []
  let oneAgo = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let rowMinimum = i
    for (let j = 1; j <= b.length; j++) {
      let cost = Math.min(
        oneAgo[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        oneAgo[j] + 1,
        row[j - 1] + 1
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cost = Math.min(cost, twoAgo[j - 2] + 1)
      }
      row.push(cost)
      if (cost < rowMinimum) rowMinimum = cost
    }
    if (rowMinimum > max) return max + 1
    twoAgo = oneAgo
    oneAgo = row
  }

  return oneAgo[b.length]
}

/** How a candidate name matched: tier, edits spent, name length — lower wins. */
type MatchRank = [tier: number, edits: number, length: number]

const compareRank = (a: MatchRank, b: MatchRank): number =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/**
 * Autocomplete over english names, local-name variants and aliases.
 * Tiers: prefix, then word-prefix ("guinea" → "Papua New Guinea"), then
 * substring, then fuzzy (typo-tolerant, edit budget scaled to query length).
 * Fuzzy hits can never outrank a literal match, so the tolerance costs no
 * relevancy; ties break toward shorter names ("India" before "Indonesia").
 */
export const searchCountriesByName = (
  query: string,
  limit = 6,
  excluded?: ReadonlySet<ISOCountryCode>
): Country[] => {
  const normalized = normalizeCountryName(query)
  if (!normalized) return []

  const maxEdits = normalized.length >= 7 ? 2 : normalized.length >= 4 ? 1 : 0

  const best = new Map<ISOCountryCode, MatchRank>()
  for (const [name, isoCode] of getNameIndex()) {
    if (excluded?.has(isoCode)) continue

    let rank: MatchRank | undefined
    if (name.startsWith(normalized)) rank = [0, 0, name.length]
    else if (name.includes(` ${normalized}`)) rank = [1, 0, name.length]
    else if (name.includes(normalized)) rank = [2, 0, name.length]
    else if (maxEdits) {
      // Compare against both the whole name (typo in a finished word) and its
      // same-length prefix (typo while still typing)
      const edits = Math.min(
        editDistance(normalized, name, maxEdits),
        editDistance(normalized, name.slice(0, normalized.length), maxEdits)
      )
      if (edits <= maxEdits) rank = [3, edits, name.length]
    }

    if (!rank) continue
    const current = best.get(isoCode)
    if (!current || compareRank(rank, current) < 0) best.set(isoCode, rank)
  }

  return [...best.entries()]
    .sort(([, a], [, b]) => compareRank(a, b))
    .slice(0, limit)
    .map(([isoCode]) => COUNTRIES[isoCode])
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
