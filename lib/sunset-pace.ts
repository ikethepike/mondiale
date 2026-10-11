import type { SunsetBlitzChallenge } from '~~/types/challenges/final-challenge.type'
import type { GameDifficulty } from '~~/types/game.types'

/** Sunset Blitz's pacing and verdict — pure arithmetic, no map data, so the server's clocks can read it. */

/**
 * The night window per difficulty: how many countries the dealt frame holds,
 * the share of them that passes, and the night's pace — seconds it spends on
 * each country, easing from the first to the last so the run tightens as it
 * goes. Easy never deals the finale; its row keeps the record total.
 */
export const SUNSET_TUNING: {
  [difficulty in GameDifficulty]: {
    countries: [minimum: number, maximum: number]
    quotaRatio: number
    pace: [first: number, last: number]
  }
} = {
  easy: { countries: [8, 10], quotaRatio: 0.4, pace: [6, 4.5] },
  normal: { countries: [9, 12], quotaRatio: 0.5, pace: [5, 3.5] },
  hard: { countries: [11, 15], quotaRatio: 0.6, pace: [4, 2.5] },
}

/** The night's approach from off-screen east before its first country's turn. */
export const SUNSET_LEAD_SECONDS = 2

export const sunsetQuota = ({
  countries,
  quotaRatio,
}: Pick<SunsetBlitzChallenge, 'countries' | 'quotaRatio'>): number =>
  Math.ceil(countries.length * quotaRatio)

/**
 * When the night takes each country of a field, in seconds from the sweep's
 * start, east→west: one turn per country rather than one speed across the
 * map, so a dense cluster never falls in a burst and an empty stretch never
 * idles. The grading and the drawn line both read this one schedule.
 */
export const sunsetSchedule = (countryCount: number, difficulty: GameDifficulty): number[] => {
  const [first, last] = SUNSET_TUNING[difficulty].pace
  const times: number[] = []
  let at = SUNSET_LEAD_SECONDS
  for (let index = 0; index < countryCount; index++) {
    at += first + (last - first) * (index / Math.max(1, countryCount - 1))
    times.push(at)
  }
  return times
}

export const sunsetSeconds = (countryCount: number, difficulty: GameDifficulty): number =>
  Math.ceil(sunsetSchedule(countryCount, difficulty).at(-1) ?? SUNSET_LEAD_SECONDS)

/** How many of the field the night has taken `elapsed` seconds in. */
export const sunsetDarkCount = (schedule: readonly number[], elapsed: number): number => {
  let count = 0
  while (count < schedule.length && schedule[count]! <= elapsed) count++
  return count
}

/**
 * The run's verdict as soon as it is settled: `held` once the quota is lit,
 * `lost` once the countries still standing can no longer reach it.
 */
export const sunsetOutcome = (
  lit: number,
  standing: number,
  quota: number
): 'held' | 'lost' | undefined => {
  if (lit >= quota) return 'held'
  if (lit + standing < quota) return 'lost'
  return undefined
}
