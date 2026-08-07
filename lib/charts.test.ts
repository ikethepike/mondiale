import { describe, expect, it } from 'vitest'
import {
  MIN_BAR_PERCENT,
  monotoneCurvePath,
  niceTicks,
  rankedBarWidths,
  type ChartPoint,
} from './charts'

/** Every coordinate in a path's `C`/`M` commands, in order. */
const coordinates = (path: string): number[] => path.match(/-?\d+\.?\d*/g)?.map(Number) ?? []

describe('monotoneCurvePath', () => {
  it('draws nothing for an empty series', () => {
    expect(monotoneCurvePath([])).toBe('')
  })

  it('moves to the point and stops for a single point', () => {
    expect(monotoneCurvePath([{ x: 3, y: 12 }])).toBe('M 3.00,12.00')
  })

  it('never overshoots the data — the whole reason for monotone cubic', () => {
    // A steep rise into a plateau is where a naive spline bulges past the top.
    const points: ChartPoint[] = [
      { x: 0, y: 100 },
      { x: 25, y: 90 },
      { x: 50, y: 10 },
      { x: 75, y: 8 },
      { x: 100, y: 8 },
    ]
    const ys = coordinates(monotoneCurvePath(points)).filter((_, index) => index % 2 === 1)
    const lowest = Math.min(...points.map(point => point.y))
    const highest = Math.max(...points.map(point => point.y))
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(lowest)
      expect(y).toBeLessThanOrEqual(highest)
    }
  })

  it('keeps a flat series flat', () => {
    const path = monotoneCurvePath([
      { x: 0, y: 50 },
      { x: 50, y: 50 },
      { x: 100, y: 50 },
    ])
    const ys = coordinates(path).filter((_, index) => index % 2 === 1)
    expect(ys.every(y => y === 50)).toBe(true)
  })

  it('survives repeated x values without dividing by zero', () => {
    const path = monotoneCurvePath([
      { x: 10, y: 20 },
      { x: 10, y: 40 },
    ])
    expect(coordinates(path).every(Number.isFinite)).toBe(true)
  })
})

describe('niceTicks', () => {
  it('splits a 0–1 index into halves', () => {
    expect(niceTicks(0, 1, 3)).toEqual([0, 0.5, 1])
  })

  it("walks a Gini scale's real band", () => {
    expect(niceTicks(0.2, 0.6, 3)).toEqual([0.2, 0.4, 0.6])
  })

  it('rounds an unbounded GDP domain to readable steps', () => {
    expect(niceTicks(1834, 16001, 3)).toEqual([5000, 10000, 15000])
  })

  it('lands an exact zero when the domain crosses it', () => {
    const ticks = niceTicks(-15, 15, 3)
    expect(ticks).toContain(0)
    // Float dust would leave a -1.7763568394002505e-15 in place of the 0.
    expect(ticks.some(tick => tick !== 0 && Math.abs(tick) < 1e-9)).toBe(false)
  })

  it('never steps outside the domain', () => {
    for (const [min, max] of [
      [0, 1],
      [0.2, 0.6],
      [15, 55],
      [1834, 16001],
    ]) {
      for (const tick of niceTicks(min, max, 3)) {
        expect(tick).toBeGreaterThanOrEqual(min)
        expect(tick).toBeLessThanOrEqual(max)
      }
    }
  })

  it('collapses a flat domain to a single tick', () => {
    expect(niceTicks(7, 7, 3)).toEqual([7])
    expect(niceTicks(9, 4, 3)).toEqual([9])
  })

  it('refuses non-finite bounds and degenerate counts', () => {
    expect(niceTicks(NaN, 10, 3)).toEqual([])
    expect(niceTicks(0, Infinity, 3)).toEqual([])
    expect(niceTicks(0, 10, 1)).toEqual([])
  })
})

describe('rankedBarWidths', () => {
  it('spreads a year domain that a zero baseline flattens', () => {
    // Real legalization years. Divided by the largest these span 0.9 points —
    // five bars the eye cannot tell apart.
    const widths = rankedBarWidths([2019, 2017, 2005, 2003, 2001])
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThanOrEqual(90)
  })

  it('never returns a negative width', () => {
    // A real net-migration slate: Lebanon is negative and used to render
    // width:-18.38%, which CSS drops — the bar simply vanished.
    const widths = rankedBarWidths([32.1, 28.2, 13.4, 3.9, -5.9])
    for (const width of widths) expect(width).toBeGreaterThanOrEqual(0)
    expect(widths.indexOf(Math.min(...widths))).toBe(4)
  })

  it('survives an all-negative set', () => {
    const widths = rankedBarWidths([-2.7, -10.8, -6.6])
    expect(Math.max(...widths)).toBe(100)
    expect(widths.indexOf(Math.min(...widths))).toBe(1)
  })

  it('floors the smallest so it still draws', () => {
    expect(Math.min(...rankedBarWidths([2019, 2017, 2001]))).toBe(MIN_BAR_PERCENT)
  })

  it('draws a whole-set tie as equal full bars', () => {
    expect(rankedBarWidths([1, 1, 1, 1, 1])).toEqual([100, 100, 100, 100, 100])
  })

  it('leaves a missing amount at zero, distinct from the floor', () => {
    const widths = rankedBarWidths([10, undefined, 5])
    expect(widths[1]).toBe(0)
    expect(widths[2]).toBe(MIN_BAR_PERCENT)
  })

  it('orders widths with the values', () => {
    const values = [8, 1, 5, 300, 42]
    const widths = rankedBarWidths(values)
    const byValue = [...values].sort((a, b) => a - b)
    const byWidth = [...values].sort(
      (a, b) => widths[values.indexOf(a)] - widths[values.indexOf(b)]
    )
    expect(byWidth).toEqual(byValue)
  })

  it('returns a width per value, even with nothing to plot', () => {
    expect(rankedBarWidths([undefined, undefined])).toEqual([0, 0])
    expect(rankedBarWidths([])).toEqual([])
  })
})
