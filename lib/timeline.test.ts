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
import type {
  TimelineChallenge,
  TimelinePlacement,
  TimelineState,
} from '~~/types/challenges/group-modes.type'
import type { Game, GameDifficulty, GameRules } from '~~/types/game.types'

// Hard rules keep micro-nations in play — the full event library, as before.
const WORLD: GameRules = { variant: 'world', difficulty: 'hard' }

const state = (overrides: Partial<TimelineState> = {}): TimelineState => ({
  deck: [],
  placed: [],
  card: 1,
  order: ['a', 'b', 'c'],
  activeIndex: 0,
  turn: 0,
  deadline: 0,
  placements: [],
  ...overrides,
})

describe('event card titles', () => {
  // The whole round is "when did this happen?" — a title that prints the year
  // answers its own card. Model numbers (the 747) are fine; the card's own date
  // is not, so only digits at or near `year` count as a leak.
  it('never gives away the year they ask the table to place', () => {
    const leaks = Object.entries(EVENTS).filter(([, event]) =>
      [...event.name.matchAll(/\d{3,4}/g)].some(
        match => Math.abs(Number(match[0]) - Math.abs(event.year)) <= 5
      )
    )

    expect(leaks.map(([slug, event]) => `${slug}: ${event.name}`)).toEqual([])
  })
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
  /** A hand of placements for a table, dealt round-robin the way turns rotate. */
  const placements = (
    order: string[],
    cardsEach: number,
    correctFor: (playerId: string, cardIndex: number) => boolean,
    kindFor: (playerId: string, cardIndex: number) => 'placed' | 'timeout' = () => 'placed'
  ): TimelinePlacement[] =>
    Array.from({ length: order.length * cardsEach }, (_, turn) => {
      const playerId = order[turn % order.length]
      const cardIndex = Math.floor(turn / order.length)
      return {
        playerId,
        slug: `card-${turn}`,
        chosenSlot: 0,
        correctSlot: 0,
        correct: correctFor(playerId, cardIndex),
        // The line grows by one card per turn, so slot n+2 is turn n's crowd.
        slotCount: turn + 2,
        kind: kindFor(playerId, cardIndex),
      }
    })

  const dealt = (order: string[], cardsEach: number) => ({
    order,
    deck: Array.from({ length: 1 + order.length * cardsEach }, (_, index) => `card-${index}`),
  })

  // The bug this mode shipped with: the payout was struck per turn from the
  // card's position in the DECK, which in a turn-rotation round is a proxy for
  // SEAT (order is shuffled once and never rotates). Four seats all placing
  // perfectly banked [11, 11, 13, 14] of 18, and a 2-of-3 late seat tied a
  // 3-of-3 early one. Weights now rank a seat's own cards, nothing more.
  it('pays a flawless hand the full pot from every seat, at every table size', () => {
    for (const maximumPoints of [12, 15, 18]) {
      for (const players of [2, 3, 4, 5, 6]) {
        for (const cardsEach of [2, 3]) {
          const order = Array.from({ length: players }, (_, index) => `p${index}`)
          const scores = scoreTimeline(
            challenge(
              { ...dealt(order, cardsEach), placements: placements(order, cardsEach, () => true) },
              maximumPoints
            )
          )

          for (const playerId of order) {
            expect(scores[playerId]).toEqual({ scored: maximumPoints, maximum: maximumPoints })
          }
        }
      }
    }
  })

  it('ranks a better hand above a worse one regardless of seat', () => {
    const order = ['first', 'second', 'third', 'last']
    // The first seat is flawless; the last seat drops its opening card.
    const scores = scoreTimeline(
      challenge(
        {
          ...dealt(order, 3),
          placements: placements(
            order,
            3,
            (playerId, cardIndex) => !(playerId === 'last' && cardIndex === 0)
          ),
        },
        18
      )
    )

    expect(scores.first.scored).toBe(18)
    expect(scores.last.scored).toBeLessThan(scores.first.scored)
  })

  it('pays about half the pot for half a hand', () => {
    const order = ['a', 'b']
    const scores = scoreTimeline(
      challenge(
        {
          ...dealt(order, 4),
          placements: placements(order, 4, (_playerId, cardIndex) => cardIndex % 2 === 0),
        },
        18
      )
    )

    for (const playerId of order) {
      expect(scores[playerId].scored).toBeGreaterThan(6)
      expect(scores[playerId].scored).toBeLessThan(12)
    }
  })

  it('costs the player who times out, not the table', () => {
    const order = ['steady', 'idle']
    const scores = scoreTimeline(
      challenge(
        {
          ...dealt(order, 3),
          placements: placements(
            order,
            3,
            playerId => playerId === 'steady',
            playerId => (playerId === 'idle' ? 'timeout' : 'placed')
          ),
        },
        18
      )
    )

    expect(scores.steady).toEqual({ scored: 18, maximum: 18 })
    expect(scores.idle).toEqual({ scored: 0, maximum: 18 })
  })

  // A room mid-round when this shipped has placements with no `slotCount`.
  // Weighing those as NaN scored the whole table zero — every seat robbed of a
  // round they had already played.
  it('still pays a round that was in flight before slotCount existed', () => {
    const legacy = challenge({ order: ['p0', 'p1'], deck: ['a', 'b', 'c', 'd'] }, 18)
    legacy.state.placements = [
      { playerId: 'p0', slug: 'b', chosenSlot: 0, correctSlot: 0, correct: true, kind: 'placed' },
      { playerId: 'p1', slug: 'c', chosenSlot: 0, correctSlot: 0, correct: false, kind: 'placed' },
    ] as unknown as TimelinePlacement[]

    const scores = scoreTimeline(legacy)
    expect(scores.p0).toEqual({ scored: 18, maximum: 18 })
    expect(scores.p1).toEqual({ scored: 0, maximum: 18 })
  })

  it('scores a seat that never placed a card as zero', () => {
    const order = ['a', 'b']
    const scores = scoreTimeline(challenge({ ...dealt(order, 2), placements: [] }, 15))

    expect(scores.a).toEqual({ scored: 0, maximum: 15 })
    expect(scores.b).toEqual({ scored: 0, maximum: 15 })
  })
})

describe('formatEventYear', () => {
  it('never shows a bare negative', () => {
    expect(formatEventYear(-490)).toBe('490 BCE')
    expect(formatEventYear(1989)).toBe('1989')
  })

  it('groups deep-time digits', () => {
    expect(formatEventYear(-9500)).toBe('9,500 BCE')
    expect(formatEventYear(-10000)).toBe('10,000 BCE')
  })

  it('drops the era for geological time', () => {
    expect(formatEventYear(-66000000)).toBe('66 million years ago')
    expect(formatEventYear(-251900000)).toBe('251.9 million years ago')
    expect(formatEventYear(-2450000000)).toBe('2.45 billion years ago')
  })
})

describe('dealTimelineDeck', () => {
  it('deals unique, country-capped decks from the world pool', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const deck = dealTimelineDeck(WORLD, 10, 10)
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
    expect(dealTimelineDeck(WORLD, Object.keys(EVENTS).length + 1, 0)).toBeUndefined()
  })

  it('confines an era-windowed deck to one stretch of history', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const deck = dealTimelineDeck(WORLD, 10, 2, 140)
      expect(deck).toBeDefined()
      const years = deck!.map(slug => EVENTS[slug]!.year)
      expect(Math.max(...years) - Math.min(...years)).toBeLessThanOrEqual(140)
    }
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
    expect(dealt.revealSeconds).toBeGreaterThan(0)
  })

  it('scales with difficulty: era-clustered and faster on hard, roomier on easy', async () => {
    process.env.FORCE_ROUND_TYPE = 'timeline'
    const hard = (await getRoundChallenge({ game: game('hard') })) as TimelineChallenge
    const easy = (await getRoundChallenge({ game: game('easy') })) as TimelineChallenge

    expect(hard.turnSeconds).toBeLessThan(easy.turnSeconds)
    expect(easy.state.deck.length).toBeLessThan(hard.state.deck.length)

    // Hard confines the round to one era; easy spreads the centuries out.
    const hardYears = hard.state.deck.map(slug => EVENTS[slug]!.year)
    expect(Math.max(...hardYears) - Math.min(...hardYears)).toBeLessThanOrEqual(140)
    const easyYears = [...easy.state.deck.map(slug => EVENTS[slug]!.year)].sort((a, b) => a - b)
    for (let index = 1; index < easyYears.length; index++) {
      expect(easyYears[index] - easyYears[index - 1]).toBeGreaterThanOrEqual(25)
    }
  })

  it('never deals when the trends group is toggled off (unforced weights)', async () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const dealt = await getRoundChallenge({ game: game('normal', { trends: false }) })
      expect('_type' in dealt && dealt._type === 'timeline-challenge').toBe(false)
    }
  })
})
