import { EVENTS } from '~~/data/events.gen'
import type { EventEntry } from '~~/generators/create-events-file'
import type { GameDifficulty, GameRules } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { isValidISOCode } from '~~/types/geography.types'
import { shuffleArray } from './arrays'
import { isCountryPlayable } from './game-rules'

/**
 * Chronicle's pure logic: which countries have enough history on file, which
 * events a gate deals, and whether an ordering is right. The gate view grades
 * through `isChronicleOrdered` and the reveal reads the same module, so the
 * question and the verdict cannot drift (the client-trust posture —
 * higher-lower's precedent; `EVENTS` is already in the client bundle for the
 * Timeline round, so the payload carries only slugs).
 */
export const CHRONICLE_TUNING: {
  [difficulty in GameDifficulty]: {
    /** Event cards to order. */
    cards: number
    /** Dealt cards keep at least this many years apart — a fair ordering
     *  question, not a coin flip between 1957 and 1958. */
    minimumYearGap: number
  }
} = {
  easy: { cards: 3, minimumYearGap: 10 },
  normal: { cards: 4, minimumYearGap: 10 },
  hard: { cards: 5, minimumYearGap: 10 },
}

const eventsOf = (isoCode: ISOCountryCode): [string, EventEntry][] =>
  Object.entries(EVENTS).filter(([, event]) => event.country === isoCode)

/** Largest subset of pairwise-spaced years, greedily over the sorted list. */
const spacedCount = (years: number[], gap: number): number => {
  let count = 0
  let last = -Infinity
  for (const year of [...years].sort((a, b) => a - b)) {
    if (year - last >= gap) {
      count++
      last = year
    }
  }
  return count
}

/** Countries with enough well-spaced events to deal a full hand. */
export const chronicleCountries = (
  rules: GameRules,
  difficulty: GameDifficulty
): ISOCountryCode[] => {
  const { cards, minimumYearGap } = CHRONICLE_TUNING[difficulty]
  const tally = new Map<ISOCountryCode, number[]>()
  for (const event of Object.values(EVENTS)) {
    if (!isValidISOCode(event.country)) continue
    const years = tally.get(event.country) ?? []
    years.push(event.year)
    tally.set(event.country, years)
  }
  return [...tally.entries()]
    .filter(([isoCode, years]) => {
      if (!isCountryPlayable(rules, isoCode)) return false
      return spacedCount(years, minimumYearGap) >= cards
    })
    .map(([isoCode]) => isoCode)
}

/**
 * A hand of spaced event slugs for one country, in display (shuffled) order.
 * Random restarts over the shuffled deck so back-to-back deals of the same
 * country vary; undefined when the country can't fill a spaced hand.
 */
export const dealChronicleEvents = (
  isoCode: ISOCountryCode,
  difficulty: GameDifficulty
): string[] | undefined => {
  const { cards, minimumYearGap } = CHRONICLE_TUNING[difficulty]
  const deck = eventsOf(isoCode)

  const ATTEMPTS = 8
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const chosen: [string, EventEntry][] = []
    for (const candidate of shuffleArray(deck)) {
      const clear = chosen.every(
        ([, event]) => Math.abs(event.year - candidate[1].year) >= minimumYearGap
      )
      if (clear) chosen.push(candidate)
      if (chosen.length === cards) return shuffleArray(chosen.map(([slug]) => slug))
    }
  }
  return undefined
}

/** True when the given order runs earliest → latest. */
export const isChronicleOrdered = (slugs: string[]): boolean =>
  slugs.every((slug, index) => {
    if (index === 0) return true
    const previous = EVENTS[slugs[index - 1]]
    const current = EVENTS[slug]
    if (!previous || !current) return false
    return previous.year <= current.year
  })

/** The hand sorted earliest → latest — the reveal's truth. */
export const chronicleSolution = (slugs: string[]): string[] =>
  [...slugs].sort((a, b) => (EVENTS[a]?.year ?? 0) - (EVENTS[b]?.year ?? 0))

/** Whole years between the hand's first and last event — the reveal's span line. */
export const chronicleSpanYears = (slugs: string[]): number => {
  const years = slugs.map(slug => EVENTS[slug]?.year).filter((year): year is number => year !== undefined)
  if (years.length < 2) return 0
  return Math.max(...years) - Math.min(...years)
}
