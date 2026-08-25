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
import { capitalCountryByName } from '~~/lib/capitals'
import { normalizeAnswer } from '~~/lib/strings'
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
