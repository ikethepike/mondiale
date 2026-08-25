/**
 * Fetch a city-plan tile.
 *
 * The tiles are static JSON under `public/`, not bundled modules, and that is a
 * build constraint rather than a preference: as `.gen.ts` each one was a module
 * Rollup had to parse, transform and hold in the bundle graph, and at 172 of
 * them the production build exhausted its heap. Vite copies `public/` verbatim,
 * so the roster costs the build nothing and can grow without threatening it.
 *
 * A round still pays for exactly the city it deals — one request, 20-30KB, and
 * the browser caches it.
 */
import type { CityPlanPaths } from '~~/types/challenges/group-modes.type'

/** Tiles already fetched this session, so a repeated city is free. */
const cache = new Map<string, CityPlanPaths>()

export const loadCityPlan = async (slug: string): Promise<CityPlanPaths | undefined> => {
  const held = cache.get(slug)
  if (held) return held

  const response = await fetch(`/city-plans/${slug}.json`).catch(() => undefined)
  if (!response?.ok) return undefined

  const paths = (await response.json().catch(() => undefined)) as CityPlanPaths | undefined
  if (paths) cache.set(slug, paths)
  return paths
}
