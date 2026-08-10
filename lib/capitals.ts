import { CAPITALS } from '~~/data/capitals.gen'
import { CITY_LIGHTS } from '~~/data/cities.gen'
import { normalizeAnswer } from '~~/lib/strings'
import type { CityLight } from '~~/types/city.type'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'

/**
 * The capital's row in the city-lights dataset, matched by name — GeoNames
 * spellings drift from Wikidata's, so alt names count. Undefined when the
 * capital falls below the cities15000 cut (Ngerulmud, Yaren…) or the
 * spellings never meet; callers must degrade gracefully.
 */
export const capitalCityLight = (isoCode: ISOCountryCode): CityLight | undefined => {
  const name = CAPITALS[isoCode]?.name
  if (!name) return undefined
  const wanted = normalizeAnswer(name)
  return CITY_LIGHTS[isoCode]?.find(city =>
    [city.name, city.local, city.native, ...city.alt]
      .filter((candidate): candidate is string => !!candidate)
      .some(candidate => normalizeAnswer(candidate) === wanted)
  )
}

/** Every spelling a typed capital answer may arrive as — canonical first. */
const capitalSpellings = (isoCode: ISOCountryCode): string[] => {
  const canonical = CAPITALS[isoCode]?.name
  if (!canonical) return []
  const light = capitalCityLight(isoCode)
  return [canonical, light?.local, light?.native, ...(light?.alt ?? [])].filter(
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
