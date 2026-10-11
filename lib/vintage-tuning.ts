import type { GameDifficulty } from '~~/types/game.types'
import { isFameDealable, type Fame } from '~~/types/fame.types'
import { taperScore } from './scoring'

export const VINTAGE_TUNING: Record<
  GameDifficulty,
  {
    labelled: boolean
    /** Units that must look different from 2019 for a scene to be dealt. */
    minTells: number
    /** May deal the oldest map, whose band starts where the data does
     *  rather than where history changed. */
    oldestMap: boolean
    /** Years either side of the dealt map's runs that still pay in full. */
    grace: number
    /** Years outside the runs at which a guess pays nothing. */
    zeroAt: number
    /** How the dealer leans across the tiers the difficulty may deal. */
    fameWeights: { [fame in Fame]: number }
  }
> = {
  easy: {
    labelled: true,
    minTells: 5,
    oldestMap: false,
    grace: 3,
    zeroAt: 30,
    fameWeights: { major: 1, minor: 0, obscure: 0 },
  },
  normal: {
    labelled: true,
    minTells: 3,
    oldestMap: false,
    grace: 1,
    zeroAt: 25,
    fameWeights: { major: 1, minor: 0.4, obscure: 0 },
  },
  hard: {
    labelled: false,
    minTells: 2,
    oldestMap: true,
    grace: 0,
    zeroAt: 20,
    fameWeights: { major: 0.4, minor: 0.7, obscure: 1 },
  },
}

/** A tier the difficulty may not deal weighs nothing, whatever the table says. */
export const vintageFameWeight = (fame: Fame, difficulty: GameDifficulty): number =>
  isFameDealable(fame, difficulty) ? VINTAGE_TUNING[difficulty].fameWeights[fame] : 0

/** Signed years from a guess to the nearest year that shows the dealt map:
 *  negative early, positive late, 0 inside. */
export const yearsFrom = (runs: readonly (readonly [number, number])[], year: number): number => {
  let nearest = Infinity
  for (const [from, to] of runs) {
    const off = year < from ? year - from : year > to ? year - to : 0
    if (Math.abs(off) < Math.abs(nearest)) nearest = off
  }
  return nearest
}

export const yearsOff = (runs: readonly (readonly [number, number])[], year: number) =>
  Math.abs(yearsFrom(runs, year))

export const VINTAGE_FAME = {
  /** Share of the camera frame a step must visibly change to be a landmark a
   *  player can date the map by. */
  landmark: 0.01,
  /** A rename shows as a label, not a fill, so it weighs less than a recolour. */
  rename: 0.5,
  /** Expected share of the points that makes a scene `major`, then `minor`. */
  major: 0.85,
  minor: 0.65,
}

/**
 * How datable each scene is: the share of the points a player earns who sees
 * every landmark step, knows its year, and guesses evenly between the nearest
 * landmarks either side. A scene amid long stretches where nothing big moves
 * (South America after 1900, Europe's Cold War) scores low however many small
 * renames tell it apart. Paid on normal's curve; `salience[i]` is the frame
 * share step i changes.
 */
export const sceneLegibility = ({
  spans,
  classes,
  salience,
}: {
  spans: readonly (readonly [number, number])[]
  classes: readonly number[]
  salience: readonly number[]
}): number[] => {
  const { grace, zeroAt } = VINTAGE_TUNING.normal
  const last = spans.length - 1
  return spans.map((_, scene) => {
    let first = scene
    while (first > 0 && classes[first - 1] === classes[scene]) first--
    let final = scene
    while (final < last && classes[final + 1] === classes[scene]) final++
    const from = spans[first][0]
    const to = spans[final][1]
    let before = first - 1
    while (before >= 0 && salience[before] < VINTAGE_FAME.landmark) before--
    let after = final
    while (after < last && salience[after] < VINTAGE_FAME.landmark) after++
    const low = spans[before + 1][0]
    const high = spans[after][1]
    let earned = 0
    for (let year = low; year <= high; year++)
      earned += taperScore({
        distance: yearsOff([[from, to]], year),
        perfect: grace,
        zero: zeroAt,
        maximumPoints: 100,
      })
    return earned / 100 / (high - low + 1)
  })
}

export const legibleFame = (legibility: number): Fame =>
  legibility >= VINTAGE_FAME.major
    ? 'major'
    : legibility >= VINTAGE_FAME.minor
      ? 'minor'
      : 'obscure'
