import { describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { playableCountries } from '~~/lib/game-rules'
import {
  pickSunsetWindow,
  SUNSET_FRAME_ASPECT,
  SUNSET_SECONDS,
  SUNSET_TUNING,
  sunsetDuskCoordinate,
  sunsetQuota,
  sunsetSeconds,
  sunsetWindowAround,
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

  it('sizes the quota and the clock from the field', () => {
    expect(sunsetQuota(Array(13).fill('SE'), 0.6)).toBe(8)
    expect(sunsetSeconds(12, 'hard')).toBe(48)
    expect(sunsetSeconds(2, 'hard')).toBe(SUNSET_SECONDS[0])
    expect(sunsetSeconds(40, 'normal')).toBe(SUNSET_SECONDS[1])
  })
})
