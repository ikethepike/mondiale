import { sampleMany } from '~~/lib/arrays'
import { capitalStar, type CapitalStar } from '~~/lib/capitals'
import { playableCountries } from '~~/lib/game-rules'
import { haversineKm } from '~~/lib/geo'
import type { StarChartChallenge } from '~~/types/challenges/group-modes.type'
import type { GameDifficulty, GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The Star Chart's rules: which capitals may pulse in the dark, how far apart
 * they must sit, and how obscure each of the night's stars is allowed to be.
 * The dealer in lib/challenges.ts is a thin wrapper over `pickStarChart`; the
 * view and the reveal resolve their cities through `starChartStars`.
 */

/**
 * Stars per round. Five rather than the three the mode was pitched at, for two
 * reasons that are really one: with three, `blitzScore`'s flat one-point charge
 * per wrong name is only a sixth of a star on hard, so naming all three plus
 * five wrong capitals (13) beat a clean two (12) — spraying paid. Five makes a
 * wrong name cost ~28% of a star and inverts that (13 against a clean four's
 * 14). It also takes the round from four possible scores to six, which matters
 * because points ARE board steps: a round the whole table ties on moves nobody.
 */
export const STAR_CHART_STARS = 5

/**
 * The play window, derived from the star count rather than fixed — the Mother
 * Tongue rule, so a retune of the count carries its own clock with it. Twelve
 * seconds a star once the opening read is paid for, capped so a wide night
 * never outstays the table's patience.
 */
export const STAR_CHART_BASE_SECONDS = 20
export const STAR_CHART_SECONDS_PER_STAR = 8
export const STAR_CHART_MAX_SECONDS = 75

export const starChartSeconds = (count: number): number =>
  Math.min(STAR_CHART_MAX_SECONDS, STAR_CHART_BASE_SECONDS + count * STAR_CHART_SECONDS_PER_STAR)

/**
 * How far apart two stars must sit to be separate questions. Vienna and
 * Bratislava are 55 km apart — at world-map scale their dots overlap, and
 * "which city is this" stops having one answer. 600 km keeps every pair
 * visibly distinct at any framing the camera picks.
 */
export const STAR_MIN_SEPARATION_KM = 600

/**
 * How deep into the capital field a difficulty may reach, as `[from, to]`
 * shares of it — `starChartField` sorts by city population, the best proxy the
 * data carries for "would a player have heard of it".
 *
 * ONE pair of numbers per difficulty, and the per-star ladder is derived from
 * it (`starWindows`) rather than hand-written, so the star count can move
 * without a matrix moving with it. Easy stays in the household names; hard
 * reaches the tail and gives up the very top, because its opening star should
 * still be a thinker.
 */
export const STAR_CHART_REACH: {
  [difficulty in GameDifficulty]: readonly [number, number]
} = {
  easy: [0, 0.45],
  normal: [0, 0.8],
  hard: [0.1, 1],
}

/**
 * How far each star's window slides back toward the reach's start. At 0 the
 * windows are disjoint and the ladder is rigid; at 1 every star draws from the
 * whole reach and the ladder disappears. A half keeps the climb legible while
 * leaving enough overlap that a thin continental field still fills.
 */
const WINDOW_OVERLAP = 0.5

/**
 * The per-star obscurity ladder: a difficulty's reach sliced into `count`
 * ascending, overlapping windows, so the night opens on its most famous star
 * and ends on its deepest cut. Derived, so five stars and three stars get the
 * same shape from the same two numbers.
 */
export const starWindows = (
  difficulty: GameDifficulty,
  count: number = STAR_CHART_STARS
): [number, number][] => {
  const [from, to] = STAR_CHART_REACH[difficulty]
  const span = to - from
  return Array.from({ length: count }, (_, index) => [
    from + span * (index / count) * (1 - WINDOW_OVERLAP),
    from + span * ((index + 1) / count),
  ])
}

/** Never slice a window thinner than this — a continental variant's field is
 *  small, and a 15% window of 20 capitals is three candidates. */
const MINIMUM_WINDOW = 6

/**
 * Every capital this game could put in the sky, most populous first. Gated on
 * `capitalStar`, so a country whose capital has no coordinates (Ngerulmud,
 * Yaren) is out of the field rather than a star that renders nowhere.
 */
export const starChartField = (rules: GameRules): CapitalStar[] =>
  playableCountries(rules)
    .map(capitalStar)
    .filter((star): star is CapitalStar => !!star)
    .sort((a, b) => b.population - a.population)

/** A tier window's candidates, widened to `MINIMUM_WINDOW` where the field is
 *  too thin to honour the fraction. */
const windowCandidates = (field: CapitalStar[], [from, to]: readonly [number, number]) => {
  const start = Math.floor(field.length * from)
  const end = Math.max(start + MINIMUM_WINDOW, Math.ceil(field.length * to))
  return field.slice(start, end)
}

/**
 * Deal the night's stars: one per obscurity window, each far enough from the
 * ones already lit that its dot asks a question of its own. Undefined when the
 * board is too thin to place `STAR_CHART_STARS` separated capitals — the round
 * mix then buys another kind.
 *
 * `random` is injectable so the dealer's guards are testable; production deals
 * with `Math.random` through `sampleMany`.
 */
export const pickStarChart = (
  rules: GameRules,
  random: () => number = Math.random
): ISOCountryCode[] | undefined => {
  const field = starChartField(rules)
  if (field.length < STAR_CHART_STARS) return undefined

  const picked: CapitalStar[] = []
  const free = (candidate: CapitalStar) =>
    !picked.some(
      taken =>
        taken.isoCode === candidate.isoCode ||
        haversineKm(taken, candidate) < STAR_MIN_SEPARATION_KM
    )

  for (const window of starWindows(rules.difficulty, STAR_CHART_STARS)) {
    // The window first, so the ladder holds; then the difficulty's WHOLE reach,
    // because a small board runs out of separated capitals inside a slice long
    // before it runs out of them altogether. A five-star night on a continental
    // variant leans on this every deal — the same "never starve the pool below
    // a replayable spread" floor the water modes keep (WATER_MINIMUM_POOL).
    const star =
      sampleMany(windowCandidates(field, window), Infinity, random).find(free) ??
      sampleMany(
        windowCandidates(field, STAR_CHART_REACH[rules.difficulty]),
        Infinity,
        random
      ).find(free)
    if (star) picked.push(star)
  }

  return picked.length === STAR_CHART_STARS ? picked.map(star => star.isoCode) : undefined
}

/**
 * The dealt stars as points on the globe, in dealt order. The one resolution
 * both the round's dots and the scorecard's ledger read, so a spelling or a
 * coordinate can never differ between them. A star whose capital stopped
 * resolving (a data regeneration under a live game) drops out rather than
 * rendering at 0°,0°.
 */
export const starChartStars = (challenge: StarChartChallenge): CapitalStar[] =>
  challenge.stars.map(capitalStar).filter((star): star is CapitalStar => !!star)

/**
 * The countries the round actually grades — the stars that resolved. BOTH ends
 * score against this, never the raw `stars`: a star that stopped resolving is
 * one nobody can see and nobody can type, and grading it would leave the round
 * permanently one short of its own answer set (no early finish, and a pot the
 * table cannot reach).
 */
export const starChartAnswers = (challenge: StarChartChallenge): ISOCountryCode[] =>
  starChartStars(challenge).map(star => star.isoCode)

/** A star's initial, as the non-hard aid shows it. Derived from the same
 *  canonical name the answer matches on. */
export const starChartInitials = (stars: readonly ISOCountryCode[]): string[] =>
  stars.map(isoCode => capitalStar(isoCode)?.name.charAt(0).toUpperCase() ?? '?')
