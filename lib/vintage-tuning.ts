import type { Fame } from '~~/types/fame.types'
import type { GameDifficulty } from '~~/types/game.types'
import { taperScore } from './scoring'

export const VINTAGE_TUNING: Record<
  GameDifficulty,
  {
    labelled: boolean
    /** Units that must look different from 2019 for a scene to be dealt. */
    minTells: number
    /** Scenes ending before this year are never dealt. */
    earliest: number
    /** Years either side of the dealt map's runs that still pay in full. */
    grace: number
    /** Years outside the runs at which a guess pays nothing. */
    zeroAt: number
  }
> = {
  easy: { labelled: true, minTells: 5, earliest: 1900, grace: 3, zeroAt: 30 },
  normal: { labelled: true, minTells: 3, earliest: 1890, grace: 1, zeroAt: 25 },
  hard: { labelled: false, minTells: 2, earliest: 1886, grace: 0, zeroAt: 20 },
}

export const VINTAGE_FAME = {
  /** Share of the camera frame a step must visibly change to be a landmark a
   *  player can date the map by — South Sudan clears it, Eritrea does not. */
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
        distance: year < from ? from - year : year > to ? year - to : 0,
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
