import { afterEach, describe, expect, it } from 'vitest'
import { EVENTS } from '~~/data/events.gen'
import { getRoundChallenge } from '~~/lib/challenges'
import {
  correctSlotRange,
  dealTimelineDeck,
  formatEventYear,
  resolveSlot,
  scoreTimeline,
  slotDensityFraction,
} from '~~/lib/timeline'
import type { TimelineChallenge, TimelineState } from '~~/types/challenges/group-modes.type'
import type { Game, GameDifficulty } from '~~/types/game.types'

const state = (overrides: Partial<TimelineState> = {}): TimelineState => ({
  deck: [],
  placed: [],
  card: 1,
  order: ['a', 'b', 'c'],
  activeIndex: 0,
  turn: 0,
  deadline: 0,
  banked: {},
  placements: [],
  ...overrides,
})

const challenge = (
  stateOverrides: Partial<TimelineState> = {},
  maximumPoints = 15
): TimelineChallenge => ({
  _type: 'timeline-challenge',
  turnSeconds: 22,
  revealSeconds: 7,
  maximumPoints,
  state: state(stateOverrides),
})

describe('correctSlotRange', () => {
  const years = [1066, 1789, 1869, 1969]

  it('finds the single slot between neighbours', () => {
    expect(correctSlotRange(years, 1900)).toEqual({ low: 3, high: 3 })
  })

  it('accepts either end of the line', () => {
    expect(correctSlotRange(years, 900)).toEqual({ low: 0, high: 0 })
    expect(correctSlotRange(years, 2001)).toEqual({ low: 4, high: 4 })
  })

  it('widens across same-year neighbours instead of picking a winner', () => {
    expect(correctSlotRange([1914, 1948, 1948, 1989], 1948)).toEqual({ low: 1, high: 3 })
  })

  it('sorts BCE years below the common era', () => {
    expect(correctSlotRange([-490, 79, 1453], -44)).toEqual({ low: 1, high: 1 })
  })
})

describe('resolveSlot', () => {
  const years = [1066, 1789, 1869]

  it('confirms a correct call and keeps the chosen slot', () => {
    expect(resolveSlot(years, 1800, 2)).toEqual({ correct: true, slot: 2 })
  })

  it('snaps a miss to the nearest true slot', () => {
    expect(resolveSlot(years, 1800, 0)).toEqual({ correct: false, slot: 2 })
    expect(resolveSlot(years, 1000, 3)).toEqual({ correct: false, slot: 0 })
  })

  it('files a timeout (slot -1) into the true position', () => {
    expect(resolveSlot(years, 1900, -1)).toEqual({ correct: false, slot: 3 })
  })
})

describe('slotDensityFraction', () => {
  it('pays the floor on the opening two-slot call and full on the last', () => {
    expect(slotDensityFraction(2, 10)).toBeCloseTo(0.35)
    expect(slotDensityFraction(10, 10)).toBe(1)
  })

  it('grows with the crowd', () => {
    let previous = 0
    for (let slots = 2; slots <= 12; slots++) {
      const fraction = slotDensityFraction(slots, 12)
      expect(fraction).toBeGreaterThan(previous)
      previous = fraction
    }
  })

  it('pays a trivial line in full', () => {
    expect(slotDensityFraction(2, 2)).toBe(1)
  })
})

describe('scoreTimeline', () => {
  it('reports what each player banked, capped at the ceiling', () => {
    const scores = scoreTimeline(challenge({ banked: { a: 7.4, b: 99, c: 0 } }))
    expect(scores.a).toEqual({ scored: 7, maximum: 15 })
    expect(scores.b).toEqual({ scored: 15, maximum: 15 })
    expect(scores.c).toEqual({ scored: 0, maximum: 15 })
  })
})

describe('formatEventYear', () => {
  it('never shows a bare negative', () => {
    expect(formatEventYear(-490)).toBe('490 BCE')
    expect(formatEventYear(1989)).toBe('1989')
  })
})

describe('dealTimelineDeck', () => {
  it('deals unique, country-capped decks from the world pool', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const deck = dealTimelineDeck('world', 10, 10)
      expect(deck).toBeDefined()
      expect(deck).toHaveLength(10)
      expect(new Set(deck).size).toBe(10)

      const perCountry: { [isoCode: string]: number } = {}
      for (const slug of deck!) {
        const country = EVENTS[slug]!.country
        perCountry[country] = (perCountry[country] ?? 0) + 1
        expect(perCountry[country]).toBeLessThanOrEqual(2)
      }
    }
  })

  it('refuses a pool that cannot sustain the round', () => {
    expect(dealTimelineDeck('world', Object.keys(EVENTS).length + 1, 0)).toBeUndefined()
  })
})

// --- The dealer, through the front door ----------------------------------------

const game = (difficulty: GameDifficulty, overrides?: object): Game =>
  ({
    variant: 'world',
    difficulty,
    rounds: [{}],
    players: {
      a: { phase: 'group-challenge' },
      b: { phase: 'group-challenge' },
      c: { phase: 'group-challenge' },
    },
    ...(overrides ? { challengeOverrides: overrides } : {}),
  }) as unknown as Game

afterEach(() => {
  delete process.env.FORCE_ROUND_TYPE
})

describe('getTimelineChallenge (via getRoundChallenge)', () => {
  it('deals an opener plus a hand per player, clock unstamped', async () => {
    process.env.FORCE_ROUND_TYPE = 'timeline'
    const dealt = (await getRoundChallenge({ game: game('normal') })) as TimelineChallenge
    expect(dealt._type).toBe('timeline-challenge')
    expect(dealt.state.deck).toHaveLength(1 + 3 * 3)
    expect(dealt.state.placed).toEqual([dealt.state.deck[0]])
    expect(dealt.state.card).toBe(1)
    expect(dealt.state.deadline).toBe(0)
    expect([...dealt.state.order].sort()).toEqual(['a', 'b', 'c'])
    expect(dealt.turnSeconds).toBeGreaterThan(0)
  })

  it('never deals when the trends group is toggled off (unforced weights)', async () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const dealt = await getRoundChallenge({ game: game('normal', { trends: false }) })
      expect('_type' in dealt && dealt._type === 'timeline-challenge').toBe(false)
    }
  })
})
