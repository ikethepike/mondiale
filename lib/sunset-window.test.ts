import { describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { playableCountries } from '~~/lib/game-rules'
import {
  pickSunsetWindow,
  SUNSET_FRAME_ASPECT,
  SUNSET_LEAD_SECONDS,
  SUNSET_TUNING,
  sunsetDarkCount,
  sunsetDuskCoordinate,
  sunsetOutcome,
  sunsetQuota,
  sunsetSchedule,
  sunsetSeconds,
  sunsetSweep,
  sunsetWindowAround,
  sunsetWindows,
  windowCountries,
} from './sunset-window'
import type { GameDifficulty, GameVariant } from '~~/types/game.types'

const poolFor = (variant: GameVariant, difficulty: GameDifficulty) =>
  playableCountries({ variant, difficulty, includeMicroNations: false })

describe('sunset window', () => {
  for (const difficulty of ['normal', 'hard'] as const) {
    const pool = poolFor('world', difficulty)
    const [minimum, maximum] = SUNSET_TUNING[difficulty].countries

    it(`frames exactly its field from every anchor on ${difficulty}`, () => {
      let anchored = 0
      const regions = new Set<string>()
      for (const seed of pool) {
        const window = sunsetWindowAround(pool, difficulty, seed)
        if (!window) continue
        anchored++
        regions.add(COUNTRIES[seed]!.region)
        expect(window.countries.length).toBeGreaterThanOrEqual(minimum)
        expect(window.countries.length).toBeLessThanOrEqual(maximum)
        // The frame holds exactly the field — a centre the count never saw
        // would be a dimmed country in the middle of the window
        expect(new Set(windowCountries(pool, window.frame))).toEqual(new Set(window.countries))
        const [, , width, height] = window.frame
        expect(width / height).toBeGreaterThanOrEqual(SUNSET_FRAME_ASPECT[0])
        expect(width / height).toBeLessThanOrEqual(SUNSET_FRAME_ASPECT[1])
        // East→west: the order the night takes them
        for (let index = 1; index < window.countries.length; index++) {
          expect(sunsetDuskCoordinate(window.countries[index - 1]!)).toBeGreaterThanOrEqual(
            sunsetDuskCoordinate(window.countries[index]!)
          )
        }
        expect(sunsetWindowAround(pool, difficulty, seed)).toEqual(window)
      }
      // Most of the board can anchor a window, and every populated continent
      // can — a picker that only ever finds Europe is the bug this pins
      expect(anchored / pool.length).toBeGreaterThanOrEqual(0.5)
      for (const region of ['africa', 'asia', 'europe', 'north-america', 'south-america']) {
        expect(regions).toContain(region)
      }
    })
  }

  it('deals on every continental board that can hold a field', () => {
    for (const variant of ['africa', 'asia', 'europe', 'north-america'] as const) {
      for (const difficulty of ['normal', 'hard'] as const) {
        const pool = poolFor(variant, difficulty)
        const window = pickSunsetWindow(pool, difficulty)
        expect(window, `${variant} ${difficulty}`).toBeDefined()
        expect(window!.countries.every(isoCode => pool.includes(isoCode))).toBe(true)
      }
    }
  })

  it('sizes the quota from the field', () => {
    expect(sunsetQuota({ countries: Array(13).fill('SE'), quotaRatio: 0.6 })).toBe(8)
  })

  // The finale was a two-minute round in a gauntlet of seconds-long gates
  it('keeps every dealable window to a short run', () => {
    for (const difficulty of ['normal', 'hard'] as const) {
      for (const window of sunsetWindows(poolFor('world', difficulty), difficulty)) {
        const seconds = sunsetSeconds(window.countries.length, difficulty)
        expect(seconds).toBeGreaterThanOrEqual(30)
        expect(seconds).toBeLessThanOrEqual(60)
      }
    }
  })

  it('gives every country its own turn, tightening toward the end', () => {
    const schedule = sunsetSchedule(12, 'normal')
    const [first, last] = SUNSET_TUNING.normal.pace
    expect(schedule).toHaveLength(12)
    expect(schedule[0]).toBeCloseTo(SUNSET_LEAD_SECONDS + first)
    expect(schedule[11]! - schedule[10]!).toBeCloseTo(last)
    for (let index = 2; index < schedule.length; index++) {
      const gap = schedule[index]! - schedule[index - 1]!
      expect(gap).toBeLessThanOrEqual(schedule[index - 1]! - (schedule[index - 2] ?? 0))
      expect(gap).toBeGreaterThan(0)
    }
    expect(sunsetSeconds(12, 'normal')).toBe(Math.ceil(schedule[11]!))
  })

  it('darkens a country exactly on its turn', () => {
    const schedule = sunsetSchedule(5, 'hard')
    expect(sunsetDarkCount(schedule, 0)).toBe(0)
    schedule.forEach((at, index) => {
      expect(sunsetDarkCount(schedule, at - 0.001)).toBe(index)
      expect(sunsetDarkCount(schedule, at)).toBe(index + 1)
    })
  })

  it('draws the line through each country as its turn comes, never backing up', () => {
    const pool = poolFor('world', 'normal')
    for (const window of sunsetWindows(pool, 'normal').slice(0, 20)) {
      const field = window.countries
      const schedule = sunsetSchedule(field.length, 'normal')
      const start = sunsetDuskCoordinate(field[0]!) + 40
      const duskAt = sunsetSweep(field, schedule, start)
      expect(duskAt(0)).toBe(start)
      field.forEach((isoCode, index) => {
        expect(duskAt(schedule[index]!)).toBeCloseTo(sunsetDuskCoordinate(isoCode), 6)
      })
      let previous = start
      const end = schedule.at(-1)!
      for (let elapsed = 0; elapsed <= end + 1; elapsed += 0.05) {
        const dusk = duskAt(elapsed)
        expect(dusk).toBeLessThanOrEqual(previous + 1e-9)
        // The grading's dark set is exactly what the line has crossed
        const crossed = field.filter(iso => sunsetDuskCoordinate(iso) > dusk + 1e-6).length
        const reached = field.filter(iso => sunsetDuskCoordinate(iso) >= dusk - 1e-6).length
        expect(sunsetDarkCount(schedule, elapsed)).toBeGreaterThanOrEqual(crossed)
        expect(sunsetDarkCount(schedule, elapsed)).toBeLessThanOrEqual(reached)
        previous = dusk
      }
    }
  })

  it('settles the run as soon as the outcome is certain', () => {
    expect(sunsetOutcome(6, 3, 6)).toBe('held')
    expect(sunsetOutcome(2, 3, 6)).toBe('lost')
    expect(sunsetOutcome(3, 3, 6)).toBeUndefined()
  })
})
