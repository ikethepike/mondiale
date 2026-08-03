import { EVENTS } from '~~/data/events.gen'
import { clamp } from './number'
import type { EventEntry } from '~~/generators/create-events-file'
import type { EventKind } from '~~/generators/data/event-seeds'
import { isValidISOCode } from '~~/types/geography.types'
import type { TimelineChallenge, TimelineState } from '~~/types/challenges/group-modes.type'
import type { GameDifficulty, GameRules } from '~~/types/game.types'
import { shuffleArray } from './arrays'
import { isCountryPlayable } from './game-rules'
import { attemptFraction, clampScore } from './scoring'

/**
 * Timeline's pure logic: slot arithmetic over the growing line, the
 * density-scaled payout, and the deck picker. The turn engine
 * (lib/events/server/timeline-turns) owns the clock and state mutation;
 * everything here is side-effect free so both ends of the wire share it.
 */

export const TIMELINE_TUNING: {
  [difficulty in GameDifficulty]: {
    turnSeconds: number
    /** Seconds the post-placement story card holds — reading time. */
    revealSeconds: number
    /** Cards each player will place (the opener is on the house). */
    cardsPerPlayer: number
    /** Dealt cards keep at least this many years apart — tighter is harder. */
    minimumYearGap: number
    /**
     * Hard mode's real teeth: confine the deck to one stretch of history, so
     * calls are "1936 or 1938?", never "Vikings or the Moon landing?". Absent
     * = the whole sweep of the library, where centuries do the separating.
     */
    eraWindowYears?: number
  }
} = {
  easy: { turnSeconds: 30, revealSeconds: 9, cardsPerPlayer: 2, minimumYearGap: 25 },
  normal: { turnSeconds: 22, revealSeconds: 7, cardsPerPlayer: 3, minimumYearGap: 10 },
  hard: {
    turnSeconds: 15,
    revealSeconds: 6,
    cardsPerPlayer: 3,
    minimumYearGap: 2,
    eraWindowYears: 140,
  },
}

export const timelineEvent = (slug: string): EventEntry | undefined => EVENTS[slug]

/** "1989" for the common era, "490 BCE" before it — never a bare negative. */
export const formatEventYear = (year: number): string => (year < 0 ? `${-year} BCE` : `${year}`)

/** Card copy per event kind, shared by the view and the spectate stage. */
export const EVENT_KIND_COPY: { [kind in EventKind]: string } = {
  revolution: 'Revolution',
  nation: 'Nationhood',
  conflict: 'War & conflict',
  politics: 'Politics & treaties',
  disaster: 'Disaster',
  engineering: 'Engineering',
  science: 'Science & discovery',
  culture: 'Culture & society',
}

export const activeTimelinePlayerId = (state: TimelineState): string =>
  state.order[state.activeIndex]

/** The card the active player is holding, when the deck isn't exhausted. */
export const drawnCard = (state: TimelineState): string | undefined => state.deck[state.card]

/** The years of a line of placed cards, in line order. */
export const placedYears = (placed: string[]): number[] =>
  placed.map(slug => EVENTS[slug]?.year ?? 0)

/**
 * Where a card may legally land on the line: every insertion index that keeps
 * the years non-decreasing. Same-year neighbours widen the window — either
 * side of a tie is a fair answer, not a trick.
 */
export const correctSlotRange = (years: number[], year: number): { low: number; high: number } => {
  let low = 0
  while (low < years.length && years[low] < year) low++
  let high = years.length
  while (high > 0 && years[high - 1] > year) high--
  return { low, high }
}

/** A chosen slot resolved against the line: verdict plus where the card lands. */
export const resolveSlot = (
  years: number[],
  year: number,
  chosenSlot: number
): { correct: boolean; slot: number } => {
  const { low, high } = correctSlotRange(years, year)
  const correct = chosenSlot >= low && chosenSlot <= high
  return { correct, slot: correct ? chosenSlot : clamp(chosenSlot, low, high) }
}

/** The floor a correct opening placement (two slots) still pays. */
const FIRST_SLOT_FRACTION = 0.35

/**
 * The issue's "points scaled by how crowded the neighborhood was", through the
 * shared attempt taper: a correct call between two lonely cards pays the
 * floor, one threaded into the full line pays the ceiling.
 */
export const slotDensityFraction = (slotCount: number, maximumSlots: number): number => {
  if (maximumSlots <= 2) return 1
  return attemptFraction(maximumSlots - slotCount + 1, maximumSlots - 1, FIRST_SLOT_FRACTION)
}

/** Ceiling an individual card pays, so a full round can reach maximumPoints. */
export const perCardPoints = (challenge: TimelineChallenge): number => {
  const players = Math.max(1, challenge.state.order.length)
  const cardsEach = Math.max(1, (challenge.state.deck.length - 1) / players)
  return challenge.maximumPoints / cardsEach
}

/** Round-end conversion: what each player banked, against the shared ceiling. */
export const scoreTimeline = (
  challenge: TimelineChallenge
): { [playerId: string]: { scored: number; maximum: number } } => {
  const scores: { [playerId: string]: { scored: number; maximum: number } } = {}
  for (const playerId of challenge.state.order) {
    scores[playerId] = {
      scored: clampScore(challenge.state.banked[playerId] ?? 0, challenge.maximumPoints),
      maximum: challenge.maximumPoints,
    }
  }
  return scores
}

/** At most this many cards may share an anchor country, for a varied line. */
const MAXIMUM_PER_COUNTRY = 2

/**
 * Deal a deck of event slugs for the round: variant-filtered, era-spread by
 * the difficulty's minimum year gap, capped per country. With an era window
 * (hard mode), the whole deck is drawn from one randomly-anchored stretch of
 * history — the same century must be told apart, not the same millennium.
 * Returns undefined when the pool can't sustain the round (tiny variants) —
 * the dealer falls back to a ranking round.
 */
export const dealTimelineDeck = (
  rules: GameRules,
  cardCount: number,
  minimumYearGap: number,
  eraWindowYears?: number
): string[] | undefined => {
  // The playable-code check guards world decks too ('world' short-circuits
  // the variant test): a card with a non-playable anchor would crash every
  // client's COUNTRIES lookup when rendered — and a benched micro-nation's
  // card would put a country the game excludes on the table.
  let pool = shuffleArray(
    Object.entries(EVENTS).filter(
      ([, event]) => isValidISOCode(event.country) && isCountryPlayable(rules, event.country)
    )
  )
  if (pool.length < cardCount) return undefined

  if (eraWindowYears) {
    // Anchor the window on a shuffled candidate whose surroundings can fill
    // the deck; a sparse anchor (antiquity) is skipped, not fallen into.
    for (const [, anchor] of pool) {
      const within = pool.filter(
        ([, event]) => Math.abs(event.year - anchor.year) <= eraWindowYears / 2
      )
      if (within.length >= cardCount + 2) {
        pool = within
        break
      }
    }
  }

  const deck: string[] = []
  const years: number[] = []
  const perCountry: { [isoCode: string]: number } = {}

  const take = ([slug, event]: (typeof pool)[number]) => {
    deck.push(slug)
    years.push(event.year)
    perCountry[event.country] = (perCountry[event.country] ?? 0) + 1
  }

  for (const candidate of pool) {
    if (deck.length >= cardCount) break
    const [, event] = candidate
    if ((perCountry[event.country] ?? 0) >= MAXIMUM_PER_COUNTRY) continue
    if (years.some(year => Math.abs(year - event.year) < minimumYearGap)) continue
    take(candidate)
  }

  // The gap constraint can starve a small pool — fill the remainder loosely
  // rather than dropping the round.
  for (const candidate of pool) {
    if (deck.length >= cardCount) break
    if (deck.includes(candidate[0])) continue
    take(candidate)
  }

  return deck.length >= cardCount ? deck : undefined
}
