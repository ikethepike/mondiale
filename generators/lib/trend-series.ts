import type { ISOCountryCode } from '../../types/geography.types'

/**
 * The vendor-neutral home for per-country history series: every series
 * vendor (OWID, UN WPP, …) windows, gates and downsamples through the same
 * machinery, and the game reads the same shape back. Game code imports the
 * re-exports in `lib/trends.ts`, never this module directly.
 */

/** Series with fewer points, or spanning fewer years, are never dealt. */
export const MIN_TREND_POINTS = 5
export const MIN_TREND_SPAN_YEARS = 15

/** History older than this never reaches the game. */
export const TREND_WINDOW_YEARS = 60
/** Cap per series; sampling keeps the true first and last points. */
export const TREND_MAX_POINTS = 16

export type TrendPoint = [year: number, amount: number]
/** Ascending years. */
export type TrendSeries = TrendPoint[]
export type TrendMapping<Metric extends string> = {
  [country in ISOCountryCode]?: {
    [metric in Metric]?: TrendSeries
  }
}

/** Absent decimals means 4 significant digits (values spanning many orders
 *  of magnitude keep their shape without bloating the gen file). */
export const roundAmount = (amount: number, decimals?: number): number =>
  decimals === undefined ? Number(amount.toPrecision(4)) : Number(amount.toFixed(decimals))

/** Window, gate on density/span, downsample and round one country's history. */
export const toTrendSeries = (points: TrendPoint[], decimals?: number): TrendSeries | undefined => {
  const sorted = [...points].sort((a, b) => a[0] - b[0])
  const lastYear = sorted.at(-1)?.[0]
  if (lastYear === undefined) return undefined

  const windowed = sorted.filter(([year]) => year >= lastYear - TREND_WINDOW_YEARS)
  if (windowed.length < MIN_TREND_POINTS) return undefined
  if (lastYear - windowed[0][0] < MIN_TREND_SPAN_YEARS) return undefined

  const step = (windowed.length - 1) / (TREND_MAX_POINTS - 1)
  const indices =
    windowed.length <= TREND_MAX_POINTS
      ? windowed.map((_, index) => index)
      : [...new Set(Array.from({ length: TREND_MAX_POINTS }, (_, i) => Math.round(i * step)))]

  return indices.map(index => {
    const [year, amount] = windowed[index]
    return [year, roundAmount(amount, decimals)] as TrendPoint
  })
}
