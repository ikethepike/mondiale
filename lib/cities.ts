/**
 * Typed city name → the country it belongs to.
 *
 * The one home for the reverse join over cities at large. `lib/capitals.ts`
 * answers the same question for CAPITALS only — its index is built from
 * `CAPITALS` alone, and a mode that asks for a capital must keep going through
 * it — so this reads the wider register and falls back to that one rather than
 * keeping a second copy of it.
 *
 * Roster cities claim their key first. Measured over the gazetteer there are
 * only eight canonical-name collisions across countries, but one of them is
 * Barcelona (Spain and Venezuela): letting the gazetteer claim first would
 * hand a typed "Barcelona" to Venezuela and mark a correct answer wrong.
 */
import { CITY_LIGHTS } from '~~/data/cities.gen'
import { GROUND_PLAN_CITIES } from '~~/data/city-plans.gen'
import { CAPITALS } from '~~/data/capitals.gen'
import { capitalCityLight, capitalCountryByName, capitalSpellings } from '~~/lib/capitals'
import { normalizeAnswer } from '~~/lib/strings'
import type { CityLight } from '~~/types/city.type'
import { isValidISOCode, type ISOCountryCode } from '~~/types/geography.types'

let cityIndex: Map<string, ISOCountryCode> | undefined

const getCityIndex = (): ReadonlyMap<string, ISOCountryCode> => {
  if (cityIndex) return cityIndex
  const index = new Map<string, ISOCountryCode>()

  const claim = (name: string | undefined, isoCode: ISOCountryCode) => {
    const key = name && normalizeAnswer(name)
    if (key && !index.has(key)) index.set(key, isoCode)
  }

  // Three passes, most-specific first: a roster city owns its own name, then
  // gazetteer canonicals, then the alternate spellings that collide most.
  for (const entry of GROUND_PLAN_CITIES) {
    claim(entry.city, entry.country)
    for (const alias of entry.aliases ?? []) claim(alias, entry.country)
  }
  for (const [isoCode, cities] of Object.entries(CITY_LIGHTS)) {
    if (!isValidISOCode(isoCode)) continue
    for (const city of cities ?? []) claim(city.name, isoCode)
  }
  for (const [isoCode, cities] of Object.entries(CITY_LIGHTS)) {
    if (!isValidISOCode(isoCode)) continue
    for (const city of cities ?? []) {
      claim(city.local, isoCode)
      claim(city.native, isoCode)
      for (const alias of city.alt) claim(alias, isoCode)
    }
  }

  cityIndex = index
  return index
}

/** Resolve a typed city name to the country it sits in. */
export const cityCountryByName = (typed: string): ISOCountryCode | undefined =>
  getCityIndex().get(normalizeAnswer(typed)) ?? capitalCountryByName(typed)

/**
 * Every name that belongs to one city alone: roster names and aliases, gazetteer
 * canonicals and official capital names — the keys the indexes claim first. A
 * gazetteer variant that is one of these names another city (Lomé's row lists
 * "Rome"), so it never counts as a spelling of the city it was filed under.
 */
let canonicalKeys: Set<string> | undefined

const getCanonicalKeys = (): ReadonlySet<string> => {
  if (canonicalKeys) return canonicalKeys
  const names = [
    ...GROUND_PLAN_CITIES.flatMap(entry => [entry.city, ...(entry.aliases ?? [])]),
    ...Object.values(CITY_LIGHTS).flatMap(cities => (cities ?? []).map(city => city.name)),
    ...Object.values(CAPITALS).map(capital => capital?.name),
  ]
  canonicalKeys = new Set(
    names.filter((name): name is string => !!name).map(name => normalizeAnswer(name))
  )
  return canonicalKeys
}

const rowSpellings = (city: CityLight): string[] =>
  [city.name, city.local, city.native, ...city.alt].filter((name): name is string => !!name)

/**
 * A non-capital's gazetteer row, joined on its canonical name before any
 * alternate so a smaller town that lists the city among its variants never
 * claims the join. A capital resolves through `capitalCityLight` instead.
 */
const cityRow = (isoCode: ISOCountryCode, wanted: ReadonlySet<string>): CityLight | undefined => {
  const rows = CITY_LIGHTS[isoCode] ?? []
  return (
    rows.find(city => wanted.has(normalizeAnswer(city.name))) ??
    rows.find(city => rowSpellings(city).some(name => wanted.has(normalizeAnswer(name))))
  )
}

/**
 * Every normalized key a typed answer naming the city known as `names` in
 * `isoCode` may arrive as: the given names, the official capital name where it
 * is one, and its gazetteer row's spellings — minus any variant that is another
 * city's own name.
 */
export const citySpellingKeys = (
  isoCode: ISOCountryCode,
  names: readonly string[]
): ReadonlySet<string> => {
  const wanted = new Set(names.map(name => normalizeAnswer(name)))
  const capital = CAPITALS[isoCode]?.name
  const isCapital = !!capital && wanted.has(normalizeAnswer(capital))
  const row = isCapital ? capitalCityLight(isoCode) : cityRow(isoCode, wanted)
  const own = [...names, isCapital ? capital : undefined, row?.name]
  const variants = isCapital ? capitalSpellings(isoCode) : row ? rowSpellings(row) : []
  const canonical = getCanonicalKeys()
  return new Set(
    [
      ...own.filter((name): name is string => !!name).map(name => normalizeAnswer(name)),
      ...variants.map(name => normalizeAnswer(name)).filter(key => !canonical.has(key)),
    ].filter(key => !!key)
  )
}
