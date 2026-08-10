import { describe, expect, it } from 'vitest'
import { EVENTS } from '~~/data/events.gen'
import { eventFame } from '~~/lib/timeline'
import {
  CHRONICLE_TUNING,
  chronicleCountries,
  chronicleSolution,
  chronicleSpanYears,
  dealChronicleEvents,
  isChronicleOrdered,
} from '~~/lib/chronicle'
import type { GameRules } from '~~/types/game.types'

const WORLD: GameRules = { difficulty: 'normal', variant: 'world' }

describe('chronicleCountries', () => {
  it('keeps a playable pool at every difficulty', () => {
    // A regression guard on event curation: thinning the library below a
    // dealable spread should fail loudly here, not stall gates quietly.
    //
    // Easy sits far lower ON PURPOSE — it deals only `major` events (see
    // EVENT_FAME_BY_DIFFICULTY), so its pool is the handful of countries
    // whose famous history is spread across four decades-apart moments.
    // Raising this floor means promoting events to `major`, never widening
    // easy's fame gate.
    expect(chronicleCountries(WORLD, 'easy').length).toBeGreaterThanOrEqual(12)
    expect(chronicleCountries(WORLD, 'normal').length).toBeGreaterThanOrEqual(25)
    expect(chronicleCountries(WORLD, 'hard').length).toBeGreaterThanOrEqual(15)
  })
})

describe('dealChronicleEvents', () => {
  it('deals full, spaced, single-country hands for every pool country', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const { cards, minimumYearGap } = CHRONICLE_TUNING[difficulty]
      for (const isoCode of chronicleCountries(WORLD, difficulty)) {
        const hand = dealChronicleEvents(isoCode, difficulty)
        expect(hand, `${isoCode} ${difficulty}`).toBeTruthy()
        expect(hand!.length).toBe(cards)
        const years = hand!.map(slug => EVENTS[slug]!.year)
        for (const slug of hand!) expect(EVENTS[slug]!.country).toBe(isoCode)
        for (const a of years) {
          for (const b of years) {
            if (a !== b) expect(Math.abs(a - b)).toBeGreaterThanOrEqual(minimumYearGap)
          }
        }
      }
    }
  })
})

describe('isChronicleOrdered', () => {
  it('accepts the solution and rejects its reverse', () => {
    const hand = dealChronicleEvents(chronicleCountries(WORLD, 'normal')[0], 'normal')!
    const solution = chronicleSolution(hand)
    expect(isChronicleOrdered(solution)).toBe(true)
    expect(isChronicleOrdered([...solution].reverse())).toBe(false)
  })

  it('rejects unknown slugs rather than passing them', () => {
    expect(isChronicleOrdered(['not-a-real-slug', 'also-fake'])).toBe(false)
  })

  it('spans the hand first to last', () => {
    const hand = dealChronicleEvents(chronicleCountries(WORLD, 'normal')[0], 'normal')!
    const years = hand.map(slug => EVENTS[slug]!.year)
    expect(chronicleSpanYears(hand)).toBe(Math.max(...years) - Math.min(...years))
  })
})

describe('fame gating', () => {
  it('never deals an obscure event to an easy table', () => {
    for (const isoCode of chronicleCountries(WORLD, 'easy')) {
      const hand = dealChronicleEvents(isoCode, 'easy')
      expect(hand, isoCode).toBeTruthy()
      for (const slug of hand!) expect(eventFame(slug), `${isoCode}/${slug}`).toBe('major')
    }
  })

  it('widens the pool as difficulty rises', () => {
    // Cumulative tiers: anything easy can deal, normal and hard can too.
    const easy = new Set(chronicleCountries(WORLD, 'easy'))
    const normal = new Set(chronicleCountries(WORLD, 'normal'))
    for (const isoCode of easy) expect(normal.has(isoCode), isoCode).toBe(true)
  })
})
