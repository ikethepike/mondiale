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

/** Stars per round. Three is the shape the mode was pitched at: a gimme, a
 *  thinker and a deep cut, all readable at one camera framing. */
export const STAR_CHART_STARS = 3

export const STAR_CHART_SECONDS = 45

/**
 * How far apart two stars must sit to be separate questions. Vienna and
 * Bratislava are 55 km apart — at world-map scale their dots overlap, and
 * "which city is this" stops having one answer. 600 km keeps every pair
 * visibly distinct at any framing the camera picks.
 */
export const STAR_MIN_SEPARATION_KM = 600

/**
 * Obscurity windows into the capital field, which `starChartField` sorts by
 * city population — the best proxy the data carries for "would a player have
 * heard of it". Each entry is one star's `[from, to]` slice as a fraction of
 * the field, and the windows climb, so the night always opens on its most
 * famous star and ends on its least.
 *
 * Difficulty moves the whole ladder rather than its shape: easy stays in the
 * household names, hard reaches into the tail. Windows overlap on purpose —
 * a thin continental variant must still fill three stars.
 */
export const STAR_CHART_TIERS: {
  [difficulty in GameDifficulty]: readonly [number, number][]
} = {
  easy: [
    [0, 0.15],
    [0, 0.3],
    [0.1, 0.45],
  ],
  normal: [
    [0, 0.2],
    [0.15, 0.5],
    [0.35, 0.8],
  ],
  hard: [
    [0.1, 0.4],
    [0.3, 0.7],
    [0.55, 1],
  ],
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

  const tiers = STAR_CHART_TIERS[rules.difficulty].slice(0, STAR_CHART_STARS)
  const picked: CapitalStar[] = []

  for (const tier of tiers) {
    const candidates = windowCandidates(field, tier)
    const star = sampleMany(candidates, candidates.length, random).find(
      candidate =>
        !picked.some(
          taken =>
            taken.isoCode === candidate.isoCode ||
            haversineKm(taken, candidate) < STAR_MIN_SEPARATION_KM
        )
    )
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
