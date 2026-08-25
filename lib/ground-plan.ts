/**
 * The Ground Plan round's shared vocabulary: the tile frame, the layer ladder
 * and the difficulty gate over a roster entry's cuts. The generator projects
 * into the same frame these selectors read, and the view, the dealer and the
 * grader all resolve a cut through here — never by indexing `cuts` themselves.
 */
import type { GroundPlanChallenge, GroundPlanCut, GroundPlanLayer } from '~~/types/challenges/group-modes.type'
import type { GameDifficulty } from '~~/types/game.types'
import { isHardMode } from '~~/lib/game-rules'
import { sample } from '~~/lib/arrays'

/**
 * The tile's square frame in SVG user units. Shared rather than a constant on
 * either side: the generator projects into it and the view's `viewBox` reads
 * it, so a second copy would silently mis-scale every tile.
 */
export const CITY_TILE_SPAN = 1000

/**
 * The layers, in the order they land. Water is not here — it is the base frame,
 * present from the first frame because the city answered to it rather than the
 * other way round.
 *
 * The ladder ends on bridges: two banks reading as two unconnected towns, then
 * snapping together, is the round's strongest beat and nothing should follow
 * it. `green` is in the tile but lands at the reveal.
 */
export const GROUND_PLAN_LAYERS = ['fabric', 'arterials', 'rail', 'bridges'] as const satisfies readonly GroundPlanLayer[]

/** Layers a tile carries but the ladder never plays — reveal only. */
export const GROUND_PLAN_REVEAL_LAYERS = ['green'] as const satisfies readonly GroundPlanLayer[]

/**
 * The cut a difficulty deals. The diagnostic shape being in frame is the whole
 * difficulty dial: Manhattan sliced at Midtown is two rivers and a grid and
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

/** Layers revealed by the time `elapsed` layer-intervals have passed. */
export const revealedLayers = (
  challenge: Pick<GroundPlanChallenge, 'layers'>,
  revealedCount: number
): GroundPlanLayer[] => challenge.layers.slice(0, Math.max(0, revealedCount))

/**
 * What a correct answer is worth as a fraction of the pot: the ladder, not the
 * clock. The tension in this mode is how much of the city you needed, so a
 * player who names it on the grain alone must out-score one who waited for the
 * bridges even though both beat the timer.
 */
export const groundPlanRemainingFraction = (
  challenge: Pick<GroundPlanChallenge, 'layers'>,
  revealedCount: number
): number => {
  const total = challenge.layers.length
  if (!total) return 0
  return Math.max(0, (total - revealedCount) / total)
}
