/**
 * The Ground Plan round's shared vocabulary: the tile frame, the layer ladder,
 * the roster reads and the difficulty gate over a city's cuts. The generator
 * projects into the same frame these selectors read, and the dealer, the view
 * and the grader all resolve a cut through here rather than indexing the
 * roster themselves.
 */
import type {
  GroundPlanChallenge,
  GroundPlanCity,
  GroundPlanCut,
  GroundPlanLayer,
} from '~~/types/challenges/group-modes.type'
import type { GameDifficulty } from '~~/types/game.types'
import { CITY_PLAN_INDEX, GROUND_PLAN_CITIES } from '~~/data/city-plans.gen'
import { isHardMode } from '~~/lib/game-rules'
import { sample } from '~~/lib/arrays'

/**
 * The tile frame in SVG user units. Shared rather than a constant on either
 * side: the generator projects into it and the view's `viewBox` reads it, so a
 * second copy would silently mis-scale every tile.
 *
 * Wider than it is tall so the tile can fill a screen of any shape. The height
 * is the SAFE ZONE — a centred square of `CITY_TILE_HEIGHT` holds the city's
 * diagnostic shape, and the wings either side are what a landscape screen gets
 * to show instead of cropping into it.
 */
export const CITY_TILE_HEIGHT = 1000

/** 16:9, matching the widest screen the tile has to fill. */
export const CITY_TILE_SPAN = Math.round((CITY_TILE_HEIGHT * 16) / 9)

/**
 * The layers, in the order they land. Water is not among them — it is the base
 * frame, present from the first moment, because the city answered to it rather
 * than the other way round.
 *
 * The ladder ends on bridges: two banks reading as unconnected towns and then
 * snapping together is the round's strongest beat, and nothing should follow
 * it. `green` ships in the tile but lands at the reveal.
 */
export const GROUND_PLAN_LAYERS = [
  'fabric',
  'arterials',
  'rail',
  'bridges',
] as const satisfies readonly GroundPlanLayer[]

/** Layers a tile carries but the ladder never plays — reveal only. */
export const GROUND_PLAN_REVEAL_LAYERS = ['green'] as const satisfies readonly GroundPlanLayer[]

/** Cities with at least one usable tile. */
export const groundPlanCities = (): GroundPlanCity[] => GROUND_PLAN_CITIES

/**
 * The cut a difficulty deals. The diagnostic shape being in frame is the whole
 * difficulty dial: Manhattan sliced at Midtown is two rivers and a grid that
 * could be anywhere, sliced at the Battery it is unmistakable.
 *
 * `signature` is stamped by the generator and ruled on by a human — never
 * re-derived here from a cut's position in the array.
 */
export const cutForDifficulty = (
  cuts: readonly GroundPlanCut[],
  game: { difficulty: GameDifficulty }
): GroundPlanCut | undefined => {
  const signature = cuts.filter(cut => cut.signature)
  const generic = cuts.filter(cut => !cut.signature)
  const wanted = isHardMode(game) ? generic : signature
  return sample(wanted.length ? wanted : cuts)
}

/** Distinct water crossings in a cut — what the reveal states out loud. */
export const crossingsForCut = (slug: string): number => CITY_PLAN_INDEX[slug]?.crossings ?? 0

/** Layers revealed once `revealedCount` intervals have passed. */
export const revealedLayers = (
  challenge: Pick<GroundPlanChallenge, 'layers'>,
  revealedCount: number
): GroundPlanLayer[] => challenge.layers.slice(0, Math.max(0, revealedCount))

/**
 * What a correct answer is worth as a fraction of the pot: the LADDER, not the
 * clock. How much of the city you needed is the tension in this mode, so a
 * player who names it on the grain alone must out-score one who waited for the
 * bridges, even though both beat the timer.
 */
export const groundPlanRemainingFraction = (
  challenge: Pick<GroundPlanChallenge, 'layers'>,
  revealedCount: number
): number => {
  const total = challenge.layers.length
  if (!total) return 0
  return Math.max(0, (total - revealedCount) / total)
}

/** Every spelling a typed answer may arrive as, for one roster city. */
export const citySpellings = (entry: GroundPlanCity): string[] => [
  entry.city,
  ...(entry.aliases ?? []),
]
