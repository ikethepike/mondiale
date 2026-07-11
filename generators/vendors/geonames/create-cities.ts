import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { strFromU8, unzipSync } from 'fflate'
import { ISOCountryCodes } from '../../../data/iso-codes.gen'
import { CITY_ENDONYMS } from '../../../data/static/city-endonyms'
import type { CityLight } from '../../../types/city.type'

/**
 * Top populous cities per game country, from the GeoNames cities15000 dump
 * (CC-BY 4.0, https://download.geonames.org/export/dump/). Feeds the City
 * Nocturne round: coordinates light dots on the map (projected client-side
 * through the fitted Robinson), alternate names make local spellings
 * ("München", "Warszawa") typeable.
 */
const DUMP_URL = 'https://download.geonames.org/export/dump/cities15000.zip'
const CACHE_DIR = 'generators/vendors/geonames/.cache'
const CACHE_FILE = `${CACHE_DIR}/cities15000.zip`
const OUTPUT_FILE = 'data/cities.gen.ts'
const CITIES_PER_COUNTRY = 12
const MAX_ALT_NAMES = 8

const fetchDump = async (): Promise<Uint8Array> => {
  if (existsSync(CACHE_FILE)) {
    console.info(`Using cached GeoNames dump: ${CACHE_FILE}`)
    return new Uint8Array(readFileSync(CACHE_FILE))
  }
  console.info(`Downloading ${DUMP_URL}`)
  const response = await fetch(DUMP_URL)
  if (!response.ok) {
    throw new Error(`Failed to download GeoNames dump (${response.status}): ${DUMP_URL}`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(CACHE_FILE, bytes)
  return bytes
}

const editDistance = (a: string, b: string): number => {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row.push(
        Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
      )
    }
    previous = row
  }
  return previous[b.length]!
}

/**
 * Keep variants a player could plausibly type. GeoNames' alternatenames mixes
 * local spellings ("München") with transliteration junk and airport codes;
 * closeness to the canonical name is the best available signal for the local
 * spellings, since the language of each variant isn't in this dump.
 */
/**
 * Primary language per country whose script isn't Latin — the display name
 * ("Москва", "東京") comes from GeoNames' language-tagged per-country
 * alternate files, NOT from the untagged cities dump, where first-in-script
 * picks minority languages (Chuvash "Маскав", Kurdish "ئەسکەندەریە").
 */
const NATIVE_LANGS: { [isoCode: string]: string } = {
  RU: 'ru',
  UA: 'uk',
  BY: 'be',
  BG: 'bg',
  RS: 'sr',
  MK: 'mk',
  KZ: 'kk',
  KG: 'ky',
  TJ: 'tg',
  MN: 'mn',
  GR: 'el',
  CY: 'el',
  IL: 'he',
  SA: 'ar',
  AE: 'ar',
  QA: 'ar',
  KW: 'ar',
  BH: 'ar',
  OM: 'ar',
  YE: 'ar',
  IQ: 'ar',
  SY: 'ar',
  JO: 'ar',
  LB: 'ar',
  EG: 'ar',
  LY: 'ar',
  TN: 'ar',
  DZ: 'ar',
  MA: 'ar',
  MR: 'ar',
  SD: 'ar',
  AF: 'fa',
  IR: 'fa',
  PK: 'ur',
  CN: 'zh',
  TW: 'zh',
  JP: 'ja',
  KR: 'ko',
  KP: 'ko',
  TH: 'th',
  LA: 'lo',
  KH: 'km',
  MM: 'my',
  GE: 'ka',
  AM: 'hy',
  ET: 'am',
  NP: 'ne',
  BD: 'bn',
  LK: 'si',
}

const fetchCountryAlternates = async (isoCode: string): Promise<Uint8Array> => {
  const cacheFile = `${CACHE_DIR}/alternates-${isoCode}.zip`
  if (existsSync(cacheFile)) return new Uint8Array(readFileSync(cacheFile))
  const url = `https://download.geonames.org/export/dump/alternatenames/${isoCode}.zip`
  console.info(`Downloading ${url}`)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to download alternates (${response.status}): ${url}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  writeFileSync(cacheFile, bytes)
  return bytes
}

/** geonameid → native name in the country's primary language. */
const nativeNames = async (
  isoCode: string,
  geonameIds: Set<string>
): Promise<Map<string, string>> => {
  const lang = NATIVE_LANGS[isoCode]
  if (!lang) return new Map()

  const archive = unzipSync(await fetchCountryAlternates(isoCode))
  const entry = Object.keys(archive).find(
    name => name.endsWith('.txt') && !name.startsWith('readme')
  )
  if (!entry) return new Map()

  const best = new Map<string, { name: string; preferred: boolean }>()
  for (const line of strFromU8(archive[entry]!).split('\n')) {
    // alternateNameId, geonameid, isolanguage, name, isPreferred, isShort,
    // isColloquial, isHistoric
    const [, geonameid, isolanguage, alternate, isPreferred, , isColloquial, isHistoric] =
      line.split('\t')
    if (isolanguage !== lang || !geonameid || !geonameIds.has(geonameid) || !alternate) continue
    if (isColloquial === '1' || isHistoric === '1') continue
    const preferred = isPreferred === '1'
    const current = best.get(geonameid)
    if (!current || (preferred && !current.preferred)) {
      best.set(geonameid, { name: alternate, preferred })
    }
  }
  return new Map([...best].map(([id, value]) => [id, value.name]))
}

/** Mirror of the client's matcher normalization: case + diacritics folded. */
const normalized = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const typeableVariants = (alternatenames: string, canonical: string, ascii: string): string[] => {
  // Dedupe on the normalized form — a variant that folds to an already-kept
  // spelling adds nothing to matching
  const seen = new Set([normalized(canonical), normalized(ascii)])
  const candidates: { variant: string; score: number }[] = []
  const reference = normalized(canonical)
  for (const raw of alternatenames.split(',')) {
    const variant = raw.trim()
    if (!variant || variant.length > 30 || seen.has(normalized(variant))) continue
    // Latin letters (with diacritics), spaces, hyphens and apostrophes only —
    // and no all-caps airport/station codes
    if (!/^[a-zA-ZÀ-ɏ' -]+$/.test(variant) || /^[A-Z]{2,4}$/.test(variant)) continue
    seen.add(normalized(variant))
    // Diacritic-bearing variants are usually the LOCAL spelling ("München",
    // "Kraków") — the ones worth keeping — so they outrank plain
    // transliteration noise at similar distance
    const hasDiacritics = normalized(variant) !== variant.toLowerCase()
    candidates.push({
      variant,
      score: editDistance(normalized(variant), reference) - (hasDiacritics ? 1.5 : 0),
    })
  }
  const ranked = candidates
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_ALT_NAMES)
    .map(candidate => candidate.variant)
  return ascii && normalized(ascii) !== normalized(canonical)
    ? [ascii, ...ranked].slice(0, MAX_ALT_NAMES)
    : ranked
}

export const createCitiesFile = async () => {
  const archive = unzipSync(await fetchDump())
  const entry = Object.keys(archive).find(name => name.endsWith('.txt'))
  if (!entry) throw new Error('No .txt entry in GeoNames archive')

  const gameCountries = new Set<string>(ISOCountryCodes)
  const byCountry = new Map<string, (CityLight & { geonameid: string })[]>()

  for (const line of strFromU8(archive[entry]!).split('\n')) {
    if (!line) continue
    const cells = line.split('\t')
    // GeoNames dump columns: 0 geonameid, 1 name, 2 asciiname,
    // 3 alternatenames, 4 lat, 5 lng, 6 feature class, 8 country code,
    // 14 population
    const [geonameid, name, ascii, alternatenames, lat, lng, featureClass, featureCode] = cells
    const countryCode = cells[8]
    const population = Number(cells[14])
    if (featureClass !== 'P' || !name || !countryCode || !geonameid) continue
    // Sections of cities (PPLX — Södermalm), abandoned/destroyed/historical
    // places: not cities in their own right
    if (['PPLX', 'PPLQ', 'PPLW', 'PPLH'].includes(featureCode ?? '')) continue
    if (!gameCountries.has(countryCode)) continue
    if (!Number.isFinite(population) || population <= 0) continue

    // Curated endonyms lead; ranked dump variants fill the rest
    const endonyms = CITY_ENDONYMS[countryCode]?.[name] ?? []
    const ranked = typeableVariants(alternatenames ?? '', name, ascii ?? '')
    const seen = new Set(endonyms.map(variant => variant.toLowerCase()))
    const alt = [
      ...endonyms,
      ...ranked.filter(variant => !seen.has(variant.toLowerCase())),
    ].slice(0, MAX_ALT_NAMES)

    const cities = byCountry.get(countryCode) ?? []
    cities.push({
      geonameid,
      name,
      // Display-grade only when curated — ranked variants are matching fuel,
      // not label material ("Beirlin")
      local: endonyms[0],
      alt,
      lat: Number(lat),
      lng: Number(lng),
      population,
    })
    byCountry.set(countryCode, cities)
  }

  const output: { [isoCode: string]: CityLight[] } = {}
  for (const isoCode of [...byCountry.keys()].sort()) {
    const top = byCountry
      .get(isoCode)!
      .sort((a, b) => b.population - a.population)
      .slice(0, CITIES_PER_COUNTRY)

    // Native display names, language-tagged, for the kept cities only
    const natives = await nativeNames(isoCode, new Set(top.map(city => city.geonameid)))
    output[isoCode] = top.map(({ geonameid, ...city }) => ({
      ...city,
      native: natives.get(geonameid),
    }))
  }

  writeFileSync(
    OUTPUT_FILE,
    `// Generated by generators/vendors/geonames/create-cities.ts — do not edit by hand.
// Source: GeoNames cities15000 dump (CC-BY 4.0, geonames.org).
import type { CityLight } from '~~/types/city.type'
import type { ISOCountryCode } from '~~/types/geography.types'

export const CITY_LIGHTS: { [isoCode in ISOCountryCode]?: CityLight[] } = ${JSON.stringify(output)}
`
  )
  console.info(
    `Finished creating file: ${OUTPUT_FILE} (${Object.keys(output).length} countries)`
  )
}

createCitiesFile()
