/**
 * The Ground Plan round's shared vocabulary: the tile frame, the layer ladder,
 * the roster reads and the difficulty gate over a city's cuts. The generator
 * projects into the same frame these selectors read, and the dealer, the view
 * and the grader all resolve a cut through here rather than indexing the
 * roster themselves.
 */
import type {
  GroundPlanChallenge,
  GroundPlanHint,
  GroundPlanCity,
  GroundPlanCut,
  GroundPlanLayer,
} from '~~/types/challenges/group-modes.type'
import type { GameDifficulty } from '~~/types/game.types'
import { CAPITALS } from '~~/data/capitals.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { capitalStar } from '~~/lib/capitals'
import { formatCompact } from '~~/lib/number'
import { REGION_LABELS } from '~~/lib/variant'
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

/**
 * The reveal's photograph for a roster city.
 *
 * A city that is its country's capital already ships a skyline in `CAPITALS`,
 * so the roster carries an `image` only where that would be the wrong picture
 * — New York is not Washington. Resolved here rather than in the view so the
 * dealer stamps it and the reveal stays display-only.
 */
export const groundPlanImage = (entry: GroundPlanCity): string | undefined =>
  entry.image ??
  (CAPITALS[entry.country]?.name === entry.city ? CAPITALS[entry.country]?.image : undefined)

/**
 * The hint ladder for one city, easiest first.
 *
 * The plan alone is a hard question: most players cannot read a street grid
 * cold, and a round nobody wins teaches nothing. Every rung is a fact worth
 * knowing about the country on its own terms — where it sits, what is spoken
 * there, what it pays with — so the wait is still time spent learning rather
 * than time spent stuck.
 *
 * Ordered so each narrows further than the last. The city's initial comes
 * last because it is the one that gives the answer away rather than teaching
 * anything, and a rung whose fact is missing is skipped instead of shipping
 * a hint that says nothing.
 */
export const groundPlanHints = (entry: GroundPlanCity): GroundPlanHint[] => {
  const country = COUNTRIES[entry.country]
  if (!country) return []

  const hints: GroundPlanHint[] = []

  const region = REGION_LABELS[country.region]
  if (region) hints.push({ kind: 'region', text: `Somewhere in ${region}` })

  const spoken = country.officialLanguages?.length ? country.officialLanguages : country.languages
  const language = spoken?.[0]
  if (language) {
    hints.push({
      kind: 'language',
      text:
        spoken.length > 1
          ? `They speak ${language} here, among others`
          : `They speak ${language} here`,
    })
  }

  if (country.currency) hints.push({ kind: 'currency', text: `Paid for in ${country.currency}` })

  const population = capitalStar(entry.country)?.population
  if (population) {
    hints.push({
      kind: 'size',
      text: `About ${formatCompact(population)} people live in the city itself`,
    })
  }

  hints.push({ kind: 'initial', text: `The name begins with “${entry.city.charAt(0)}”` })

  return hints
}

/** Every spelling a typed answer may arrive as, for one roster city. */
export const citySpellings = (entry: GroundPlanCity): string[] => [
  entry.city,
  ...(entry.aliases ?? []),
]
