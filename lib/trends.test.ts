import { describe, expect, it } from 'vitest'
import type { TrendSeries } from './trends'
import { dramaScore, isDecisiveGap, readTrend } from './trends'

/** Evenly spaced series from `start` to `end` over `years`. */
const line = (start: number, end: number, years = 30, points = 7): TrendSeries =>
  Array.from({ length: points }, (_, i) => [
    2024 - years + Math.round((i * years) / (points - 1)),
    start + ((end - start) * i) / (points - 1),
  ])

describe('isDecisiveGap', () => {
  it('requires 8% of the range on bounded scales', () => {
    const scale = { min: 0, max: 1 }
    expect(isDecisiveGap(0.4, 0.49, scale)).toBe(true)
    expect(isDecisiveGap(0.4, 0.45, scale)).toBe(false)
  })

  it('requires a 15% relative gap on unbounded values', () => {
    expect(isDecisiveGap(100, 120, undefined)).toBe(true)
    expect(isDecisiveGap(100, 110, undefined)).toBe(false)
  })

  it('never reads two zeros as decisive', () => {
    expect(isDecisiveGap(0, 0, undefined)).toBe(false)
  })
})

describe('readTrend', () => {
  it('reads a clean rise', () => {
    const reading = readTrend(line(10, 20), 'lifeExpectancy')
    expect(reading?.direction).toBe('rising')
    expect(reading?.startYear).toBe(1994)
    expect(reading?.endYear).toBe(2024)
    expect(reading?.startAmount).toBe(10)
    expect(reading?.endAmount).toBe(20)
  })

  it('reads a clean fall', () => {
    expect(readTrend(line(8, 4), 'co2PerCapita')?.direction).toBe('falling')
  })

  it('reads an indecisive gap as flat', () => {
    expect(readTrend(line(0.4, 0.44), 'democracyIndex')?.direction).toBe('flat')
    expect(readTrend(line(100, 108), 'gdpPerCapita')?.direction).toBe('flat')
  })

  it('damps noisy endpoints via first/last-3 means', () => {
    // A single spiked last year should not flip a falling series.
    const series: TrendSeries = [
      [1994, 10],
      [2000, 9],
      [2006, 8],
      [2012, 6],
      [2018, 5],
      [2024, 11],
    ]
    expect(readTrend(series, 'homicideRate')?.direction).toBe('falling')
  })

  it('rejects sparse series', () => {
    expect(readTrend(line(10, 20, 30, 4), 'lifeExpectancy')).toBeUndefined()
    expect(readTrend(undefined, 'lifeExpectancy')).toBeUndefined()
    expect(readTrend([], 'lifeExpectancy')).toBeUndefined()
  })

  it('rejects short spans', () => {
    expect(readTrend(line(10, 20, 14), 'lifeExpectancy')).toBeUndefined()
  })

  it('uses the bounded threshold for scaled metrics', () => {
    // Endpoint means see two thirds of a linear move, so a 0.15 raw move
    // clears the 0.08 bounded gap while a 0.1 move does not.
    expect(readTrend(line(0.5, 0.6), 'politicalCorruption')?.direction).toBe('flat')
    expect(readTrend(line(0.5, 0.65), 'politicalCorruption')?.direction).toBe('rising')
  })
})

describe('dramaScore', () => {
  it('scores a cliff above a straight diagonal of equal net change', () => {
    const diagonal = line(70, 60)
    const cliff: TrendSeries = [
      [1994, 70],
      [2000, 71],
      [2006, 72],
      [2012, 40],
      [2018, 45],
      [2024, 60],
    ]
    expect(dramaScore(cliff, 'lifeExpectancy')).toBeGreaterThan(
      dramaScore(diagonal, 'lifeExpectancy')
    )
  })

  it('scores a V-shape above a flat line', () => {
    const flat = line(50, 50)
    const vShape: TrendSeries = [
      [1994, 50],
      [2000, 30],
      [2006, 20],
      [2012, 30],
      [2018, 45],
      [2024, 50],
    ]
    expect(dramaScore(vShape, 'lifeExpectancy')).toBeGreaterThan(
      dramaScore(flat, 'lifeExpectancy')
    )
  })

  it('scores a late take-off above a steady rise', () => {
    const steady = line(0, 80)
    const takeOff: TrendSeries = [
      [1994, 0],
      [2000, 1],
      [2006, 3],
      [2012, 10],
      [2018, 45],
      [2024, 80],
    ]
    expect(dramaScore(takeOff, 'internetUse')).toBeGreaterThan(
      dramaScore(steady, 'internetUse')
    )
  })

  it('is safe on degenerate series', () => {
    expect(dramaScore([], 'gdp')).toBe(0)
    expect(dramaScore([[2024, 5]], 'gdp')).toBe(0)
    expect(dramaScore(line(0, 0), 'gdp')).toBe(0)
  })
})
