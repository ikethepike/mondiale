import { CAPITALS } from '~~/data/capitals.gen'
import { CITY_LIGHTS } from '~~/data/cities.gen'
import { normalizeAnswer } from '~~/lib/strings'
import type { CityLight } from '~~/types/city.type'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'

/**
 * Administrative qualifiers an official capital name carries and a gazetteer
 * row drops ("Yaren District" → "Yaren"). Applied to BOTH sides, and trailing
 * only: a trailing qualifier is never what distinguishes two real cities,
 * whereas a LEADING one routinely is ("South Tangerang" and "Tangerang" are
 * different places), so leading words are left to the alias table below.
 */
const CAPITAL_QUALIFIERS = ['district', 'city', 'municipality'] as const

const normalizeCapital = (value: string): string =>
  normalizeAnswer(value, { suffixes: CAPITAL_QUALIFIERS })

/**
 * Capitals whose gazetteer row is filed under a name no normalization reaches.
 * The join below already matches every spelling GeoNames ships, but its alt
 * lists are capped (MAX_ALT_NAMES in the cities generator) and its canonical
 * names sometimes predate the country's own — so a few capitals have to name
 * their row outright.
 *
 * Keyed to the CITY_LIGHTS row's `name`, and used for the LOOKUP only: the
 * capital's own name everywhere else stays the official one from CAPITALS, so
 * a reveal still reads "Ulaanbaatar". A stale entry simply fails the join the
 * way it would have anyway — it can never mis-join.
 */
const CAPITAL_ROW_ALIASES: Partial<Record<ISOCountryCode, string>> = {
  // GeoNames files the Mongolian capital under the older Russian-derived
  // transliteration, and "Ulaanbaatar" was ranked out of its eight alt names.
  MN: 'Ulan Bator',
  // The Factbook names the whole southern atoll chain; the gazetteer files the
  // settlement on it. A leading "South" is not stripped generically — see above.
  KI: 'Tarawa',
}

/**
 * The capital's row in the city-lights dataset, matched by name — GeoNames
 * spellings drift from Wikidata's, so alt names count, administrative
 * qualifiers are dropped from both sides, and a short alias table covers the
 * rows no rule reaches. Undefined where the capital is genuinely absent from
 * the dump (Ngerulmud) or falls outside the per-country slice the generator
 * keeps (Washington D.C., New Delhi, Islamabad — CITIES_PER_COUNTRY); callers
 * must degrade gracefully.
 */
export const capitalCityLight = (isoCode: ISOCountryCode): CityLight | undefined => {
  const name = CAPITAL_ROW_ALIASES[isoCode] ?? CAPITALS[isoCode]?.name
  if (!name) return undefined
  const wanted = normalizeCapital(name)
  return CITY_LIGHTS[isoCode]?.find(city =>
    [city.name, city.local, city.native, ...city.alt]
      .filter((candidate): candidate is string => !!candidate)
      .some(candidate => normalizeCapital(candidate) === wanted)
  )
}

/** Every spelling a typed capital answer may arrive as — canonical first. The
 *  row's own names ride along, so an aliased capital answers to both the
 *  official name and the gazetteer's ("Ulaanbaatar" and "Ulan Bator"). */
const capitalSpellings = (isoCode: ISOCountryCode): string[] => {
  const canonical = CAPITALS[isoCode]?.name
  if (!canonical) return []
  const light = capitalCityLight(isoCode)
  return [canonical, light?.name, light?.local, light?.native, ...(light?.alt ?? [])].filter(
    (candidate): candidate is string => !!candidate
  )
}

/**
 * A capital placed on the globe — the ONE resolution of "country → its capital
 * as a point". Undefined where the capital falls below the cities15000 cut or
 * the spellings never meet, so callers must degrade gracefully (`capitalStar`
 * is what dealers gate their pools on).
 */
export interface CapitalStar {
  isoCode: ISOCountryCode
  /** Canonical English name — the answer key and the reveal's headline. */
  name: string
  /** Local spelling ("Göteborg"), where it differs from the canonical name. */
  local?: string
  /** Native-script name ("Москва"); display-only, matching stays Latin. */
  native?: string
  lat: number
  lng: number
  population: number
}

export const capitalStar = (isoCode: ISOCountryCode): CapitalStar | undefined => {
  const name = CAPITALS[isoCode]?.name
  const light = capitalCityLight(isoCode)
  if (!name || !light) return undefined
  return {
    isoCode,
    name,
    ...(light.local && light.local !== name ? { local: light.local } : {}),
    ...(light.native ? { native: light.native } : {}),
    lat: light.lat,
    lng: light.lng,
    population: light.population,
  }
}

/**
 * Typed capital name → the country it belongs to. Built once, lazily, over
 * every accepted spelling: canonical names claim their key first, so an alt
 * spelling that collides with another capital's real name never steals it.
 *
 * The one home for the reverse join — a mode that asks for a city and scores a
 * country (the Star Chart) must not keep a private index beside this one.
 */
let capitalIndex: Map<string, ISOCountryCode> | undefined

const getCapitalIndex = (): ReadonlyMap<string, ISOCountryCode> => {
  if (capitalIndex) return capitalIndex
  const index = new Map<string, ISOCountryCode>()
  const codes = Object.keys(CAPITALS).filter(isValidISOCode)
  // Two passes, canonical before alternatives — the collision rule above.
  for (const isoCode of codes) {
    const canonical = CAPITALS[isoCode]?.name
    if (canonical) index.set(normalizeAnswer(canonical), isoCode)
  }
  for (const isoCode of codes) {
    for (const spelling of capitalSpellings(isoCode)) {
      const key = normalizeAnswer(spelling)
      if (key && !index.has(key)) index.set(key, isoCode)
    }
  }
  capitalIndex = index
  return index
}

/** Resolve a typed city name to the country whose capital it is. */
export const capitalCountryByName = (typed: string): ISOCountryCode | undefined =>
  getCapitalIndex().get(normalizeAnswer(typed))
