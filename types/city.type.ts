/** A megacity per Unique or Bust's phrasing: a city of at least a million.
 *  Lives here (not lib/unique-or-bust) so the cities generator — which can't
 *  resolve that module's `~~/` import chain — shares the same threshold. */
export const MEGACITY_MINIMUM_POPULATION = 1_000_000

/** A populous city as dealt to the City Nocturne round. */
export interface CityLight {
  /** Canonical (English/GeoNames) name — the answer key. */
  name: string
  /** Curated local spelling ("Göteborg"), shown on the lit map dot. */
  local?: string
  /** Native-script name ("Москва") where the country's primary script isn't
   *  Latin — display-only; typed matching stays Latin. */
  native?: string
  /** Typeable variants: ascii + local spellings. */
  alt: string[]
  lat: number
  lng: number
  population: number
}
