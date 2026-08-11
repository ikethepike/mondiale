import { describe, expect, it } from 'vitest'
import {
  askedBenches,
  dealParliament,
  MAX_SEAT_DOTS,
  MIN_BENCHES,
  PARLIAMENT_BENCHES,
  parliamentPool,
  seatDots,
  SEAT_COLOUR_FLOOR,
} from './parliament'
import { colorDistance } from './palette'
import type { GameRules } from '~~/types/game.types'

const RULES = { difficulty: 'normal', variant: 'world', length: 'medium' } as unknown as GameRules

/** 39 chambers deal today; the floor leaves room for an election redrawing one. */
const POOL_FLOOR = 25

describe('parliamentPool', () => {
  it('keeps enough chambers to deal from', () => {
    expect(parliamentPool(RULES).length).toBeGreaterThanOrEqual(POOL_FLOOR)
  })

  it('only offers chambers with enough placeable benches', () => {
    for (const isoCode of parliamentPool(RULES)) {
      const deal = dealParliament(RULES, 'normal', isoCode)
      expect(deal, `${isoCode} is in the pool but will not deal`).toBeDefined()
      expect(askedBenches(deal!).length).toBeGreaterThanOrEqual(MIN_BENCHES)
    }
  })
})

describe('dealParliament', () => {
  it('never asks for a bench that holds no seats', () => {
    // Germany's 2025 infobox lists the FDP at 0 — drawn nowhere on the arc, so
    // placing it has no answer.
    for (const isoCode of parliamentPool(RULES)) {
      for (const bench of askedBenches(dealParliament(RULES, 'hard', isoCode)!)) {
        expect(bench.seats, `${isoCode} asked for a 0-seat bench`).toBeGreaterThan(0)
      }
    }
  })

  it('never asks two benches a player could not tell apart', () => {
    // The colour hint is the mode's first rung, so two asked benches wearing
    // the same red make it a coin flip. Sweden's Left Party (#ED1C24) and
    // Social Democrats (#ED1B34) are the pair that proves exact-match dedup
    // is not enough.
    for (const isoCode of parliamentPool(RULES)) {
      const colours = askedBenches(dealParliament(RULES, 'hard', isoCode)!)
        .map(bench => bench.color)
        .filter((colour): colour is string => !!colour)
      for (let first = 0; first < colours.length; first += 1) {
        for (let second = first + 1; second < colours.length; second += 1) {
          expect(
            colorDistance(colours[first]!, colours[second]!),
            `${isoCode} asked two benches at ΔE ${colorDistance(colours[first]!, colours[second]!).toFixed(1)}`
          ).toBeGreaterThanOrEqual(SEAT_COLOUR_FLOOR)
        }
      }
    }
  })

  it('asks more of a harder table', () => {
    // Sweden has benches to spare at every difficulty.
    const asked = (difficulty: 'easy' | 'normal' | 'hard') =>
      askedBenches(dealParliament(RULES, difficulty, 'SE')!).length
    expect(asked('easy')).toBe(PARLIAMENT_BENCHES.easy)
    expect(asked('hard')).toBeGreaterThan(asked('easy'))
  })

  it('draws the whole chamber, not just the asked benches', () => {
    const deal = dealParliament(RULES, 'easy', 'SE')!
    expect(deal.benches.length).toBeGreaterThan(askedBenches(deal).length)
  })

  it('reads left to right', () => {
    // The arc's order is the spectrum's, so Sweden's Left Party is drawn
    // before its Sweden Democrats however many seats each holds.
    const names = dealParliament(RULES, 'hard', 'SE')!.benches.map(bench => bench.name)
    expect(names.indexOf('Left Party')).toBeLessThan(names.indexOf('Sweden Democrats'))
  })
})

describe('seatDots', () => {
  it('scales a big chamber down without losing a bloc', () => {
    // Germany is 630 seats; drawing one dot each is a wall of dots on a phone.
    const deal = dealParliament(RULES, 'normal', 'DE')!
    const dots = seatDots(deal)
    expect(dots.reduce((total, bench) => total + bench.dots, 0)).toBeLessThanOrEqual(
      MAX_SEAT_DOTS + dots.length
    )
    for (const bench of dots) expect(bench.dots).toBeGreaterThanOrEqual(1)
  })

  it('draws a small chamber at its true size', () => {
    const deal = dealParliament(RULES, 'normal', 'SE')!
    const total = seatDots(deal).reduce((sum, bench) => sum + bench.dots, 0)
    expect(total).toBeLessThanOrEqual(deal.totalSeats)
  })
})
