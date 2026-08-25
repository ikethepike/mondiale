/**
 * Lazy access to the city-plan tiles.
 *
 * Split from `lib/ground-plan.ts` because `import.meta.glob` is a Vite feature
 * and the generator imports that module under Bun, where it is undefined. Only
 * the view needs this half.
 *
 * A glob rather than a template-literal import: Vite can only code-split a
 * glob, and a bare dynamic path would bundle the whole roster into every round.
 */
import type { CityPlanPaths } from '~~/types/challenges/group-modes.type'

const TILE_LOADERS = import.meta.glob<{ CITY_PLAN: CityPlanPaths }>('~~/data/city-plans/*.gen.ts')

export const loadCityPlan = async (slug: string): Promise<CityPlanPaths | undefined> => {
  const path = Object.keys(TILE_LOADERS).find(key => key.endsWith(`/${slug}.gen.ts`))
  if (!path) return undefined
  return (await TILE_LOADERS[path]().catch(() => undefined))?.CITY_PLAN
}
