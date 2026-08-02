import { CAPITALS } from '~~/data/capitals.gen'
import { CITY_LIGHTS } from '~~/data/cities.gen'
import { normalizeAnswer } from '~~/lib/strings'
import type { CityLight } from '~~/types/city.type'
import type { ISOCountryCode } from '~~/types/geography.types'

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
