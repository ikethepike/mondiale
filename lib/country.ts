import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import type { Country, ISOCountryCode } from '~~/types/geography.types'
import { sample, shuffleArray } from './arrays'
import { baseEncode, editDistance, normalizeAnswer } from './strings'

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
  normalizeAnswer(value, { digits: false })

/**
 * The data's `name.local` packs co-official variants into one string
 * ("Schweiz / Suisse / Svizzera / Svizra", "Ellas or Ellada") — split them so
 * each is individually typeable and searchable.
 */
const localNameVariants = (country: Country): string[] =>
  country.name.local
    .split('/')
    .flatMap(variant => variant.split(' or '))
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

/** Looks like an initialism ("RDC"), not a name someone would call home. */
const isAcronym = (value: string): boolean => /^[A-Z]{2,4}$/.test(value)

/**
 * The country's own name for itself: the first local variant that is a real
 * name (not an initialism) and differs from the English exonym. The one
 * selector the endonym dealer, stage and reveal all read.
 */
export const countryEndonym = (isoCode: ISOCountryCode): string | undefined => {
  const country = COUNTRIES[isoCode]
  const english = normalizeCountryName(country.name.english)
  return localNameVariants(country).find(variant => {
    const normalized = normalizeCountryName(variant)
    return Boolean(normalized) && normalized !== english && !isAcronym(variant)
  })
}

/** Name parts that mark no single country — never a giveaway on their own
 *  ("United Seychelles Party" must scrub on "seychelles", not "united"). */
const GENERIC_NAME_TOKENS = new Set([
  'the',
  'and',
  'republic',
  'democratic',
  'peoples',
  'federal',
  'federation',
  'united',
  'kingdom',
  'state',
  'states',
  'island',
  'islands',
  'islander',
  'islanders',
  'new',
  'north',
  'south',
  'east',
  'west',
  'central',
  'saint',
  'san',
  'santa',
])

/**
 * Does this text betray the country — its name (English or local) or any of
 * its demonyms? The giveaway gate for on-screen hints: a party called
 * "Congolese Party of Labour" or "United Seychelles Party" answers a leader
 * question outright. Tokens match on a 5-char stem so "Senegal" catches
 * "Senegalese" and "España" catches "Español"; irregulars (Swiss, Dutch,
 * Spaniard) ride `name.demonyms` — the Factbook's nationality fields — so
 * no exception list lives here.
 */
export const mentionsCountry = (text: string, isoCode: ISOCountryCode): boolean => {
  const country = COUNTRIES[isoCode]
  if (!country) return false
  const markers = [
    country.name.english,
    ...localNameVariants(country),
    ...(country.name.demonyms ?? []),
  ]
    .flatMap(name => normalizeCountryName(name).split(' '))
    .filter(token => token.length >= 3 && !GENERIC_NAME_TOKENS.has(token))
  return normalizeCountryName(text)
    .split(' ')
    .filter(token => token.length >= 3)
    .some(token =>
      markers.some(
        marker => token.startsWith(marker.slice(0, 5)) || marker.startsWith(token.slice(0, 5))
      )
    )
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

/** The area line (thousand km²) between "findable on a map" and "tiny island nation". */
const LARGE_COUNTRY_AREA = 400

/** The one "is this a map-findable landmass" gate — dealers must not re-derive it. */
export const isLargeCountry = (isoCode: ISOCountryCode): boolean => {
  const total = COUNTRIES[isoCode].geography.area.total
  return !!total && total.amount > LARGE_COUNTRY_AREA
}

/**
 * A random member of `pool` biased toward ('large') or away from ('small')
 * map-findable landmasses; any pool member when none qualifies.
 */
export const pickSizedCountry = (
  pool: readonly ISOCountryCode[],
  modifier: 'large' | 'small'
): ISOCountryCode | undefined => {
  const shuffled = shuffleArray([...pool])
  return (
    shuffled.find(isoCode => {
      const total = COUNTRIES[isoCode].geography.area.total
      if (!total) return false
      return modifier === 'large' ? isLargeCountry(isoCode) : total.amount < LARGE_COUNTRY_AREA
    }) ?? shuffled[0]
  )
}

export const getRandomISOCountryCode = (modifier?: 'large' | 'small'): ISOCountryCode =>
  modifier ? pickSizedCountry(ISOCountryCodes, modifier)! : sample(ISOCountryCodes)!

export const getRandomCountry = (): Country => {
  const isoCode = getRandomISOCountryCode()
  return COUNTRIES[isoCode]
}
