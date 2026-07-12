// Type-only imports: a value import would execute the generator, which
// self-invokes at module bottom.
import type { TrendMetricId, TrendSeries } from '~~/generators/vendors/owid/create-owid'
import type { ChallengeScale, ChallengeTopic } from '~~/types/challenge.type'

export type {
  TrendMapping,
  TrendMetricId,
  TrendPoint,
  TrendSeries,
} from '~~/generators/vendors/owid/create-owid'

/** Series with fewer points, or spanning fewer years, are never dealt. */
export const MIN_TREND_POINTS = 5
export const MIN_TREND_SPAN_YEARS = 15

/**
 * Shared decisiveness convention (same as the higher-lower duel gap): bounded
 * indices cluster tightly, so they need an absolute gap of 8% of the scale's
 * range; unbounded values a 15% relative gap.
 */
export const isDecisiveGap = (a: number, b: number, scale?: ChallengeScale): boolean => {
  const gap = Math.abs(a - b)
  if (scale) return gap >= (scale.max - scale.min) * 0.08
  const reference = Math.max(Math.abs(a), Math.abs(b))
  return reference > 0 && gap / reference >= 0.15
}

/**
 * The trend-challenge metric registry, one entry per stored series.
 * `mixed` marks metrics that genuinely trend both ways across the world —
 * required for direction questions (a rising/falling question about life
 * expectancy is a giveaway). `race` marks "moved the most" eligibility.
 * `invert` on a scale means higher = worse (corruption, inequality).
 */
export const TREND_METRICS: Record<
  TrendMetricId,
  {
    label: string
    unit: string
    topic: ChallengeTopic
    scale?: ChallengeScale
    mixed: boolean
    race: boolean
  }
> = {
  democracyIndex: {
    label: 'democracy index',
    unit: 'index',
    topic: 'general knowledge',
    scale: { min: 0, max: 1 },
    mixed: true,
    race: true,
  },
  humanDevelopmentIndex: {
    label: 'Human Development Index',
    unit: 'index',
    topic: 'general knowledge',
    scale: { min: 0, max: 1 },
    mixed: false,
    race: true,
  },
  politicalCorruption: {
    label: 'political corruption',
    unit: 'index',
    topic: 'general knowledge',
    scale: { min: 0, max: 1, invert: true },
    mixed: true,
    race: true,
  },
  co2PerCapita: {
    label: 'CO₂ emissions per person',
    unit: 't',
    topic: 'environment',
    mixed: true,
    race: true,
  },
  lifeExpectancy: {
    label: 'life expectancy',
    unit: 'years',
    topic: 'health',
    mixed: false,
    race: true,
  },
  fertility: {
    label: 'fertility rate',
    unit: 'children',
    topic: 'people',
    mixed: false,
    race: true,
  },
  childMortality: {
    label: 'child mortality',
    unit: '%',
    topic: 'health',
    mixed: false,
    race: true,
  },
  internetUse: {
    label: 'internet use',
    unit: '%',
    topic: 'infrastructure',
    scale: { min: 0, max: 100 },
    mixed: false,
    race: true,
  },
  homicideRate: {
    label: 'homicide rate',
    unit: 'per 100k',
    topic: 'people',
    mixed: true,
    race: true,
  },
  gdp: {
    label: 'total GDP',
    unit: '$',
    topic: 'economics',
    mixed: false,
    race: true,
  },
  gdpPerCapita: {
    label: 'GDP per person',
    unit: '$',
    topic: 'economics',
    mixed: false,
    race: true,
  },
  gini: {
    label: 'income inequality',
    unit: 'index',
    topic: 'economics',
    // Real-world Gini coefficients span ~0.2–0.6; a 0–1 track would bury every
    // country in the middle and make the 8% decisiveness gap unreachable.
    scale: { min: 0.2, max: 0.6, invert: true },
    mixed: true,
    race: true,
  },
}

export const TREND_METRIC_IDS = Object.keys(TREND_METRICS) as TrendMetricId[]

export interface TrendReading {
  direction: 'rising' | 'falling' | 'flat'
  startYear: number
  endYear: number
  startAmount: number
  endAmount: number
  /** End-mean minus start-mean — the decisive quantity, noise-damped. */
  change: number
}

/** First/last-N means damp single-year noise at the endpoints. */
const ENDPOINT_MEAN_POINTS = 3

const mean = (points: TrendSeries): number =>
  points.reduce((sum, [, amount]) => sum + amount, 0) / points.length

/**
 * Read a series' direction via endpoint means — chosen over regression so the
 * reveal can explain itself ("1993: 62 → 2023: 74"). Indecisive gaps read as
 * 'flat'; sparse or short series read as undefined. Neither is ever dealt.
 */
export const readTrend = (
  series: TrendSeries | undefined,
  metric: TrendMetricId
): TrendReading | undefined => {
  if (!series || series.length < MIN_TREND_POINTS) return undefined
  const startYear = series[0][0]
  const endYear = series[series.length - 1][0]
  if (endYear - startYear < MIN_TREND_SPAN_YEARS) return undefined

  const startMean = mean(series.slice(0, ENDPOINT_MEAN_POINTS))
  const endMean = mean(series.slice(-ENDPOINT_MEAN_POINTS))
  const change = endMean - startMean
  const decisive = isDecisiveGap(startMean, endMean, TREND_METRICS[metric].scale)

  return {
    direction: !decisive ? 'flat' : change > 0 ? 'rising' : 'falling',
    startYear,
    endYear,
    startAmount: series[0][1],
    endAmount: series[series.length - 1][1],
    change,
  }
}

/**
 * Shape distinctiveness for trajectory-match curation: net move + biggest
 * drawdown (cliffs, V-shapes) + trajectory kink (late take-offs), normalized
 * by the scale range or the series' own magnitude. A straight diagonal scores
 * its net move only; a collapse-and-recovery of equal net scores far higher.
 */
export const dramaScore = (series: TrendSeries, metric: TrendMetricId): number => {
  const amounts = series.map(([, amount]) => amount)
  if (amounts.length < 2) return 0

  const scale = TREND_METRICS[metric].scale
  const norm = scale
    ? scale.max - scale.min
    : Math.max(...amounts.map(amount => Math.abs(amount))) || 1

  const net = Math.abs(amounts[amounts.length - 1] - amounts[0])

  let peak = amounts[0]
  let drawdown = 0
  for (const amount of amounts) {
    peak = Math.max(peak, amount)
    drawdown = Math.max(drawdown, peak - amount)
  }

  const middle = Math.floor(amounts.length / 2)
  const firstHalf = amounts[middle] - amounts[0]
  const secondHalf = amounts[amounts.length - 1] - amounts[middle]
  const kink = Math.abs(secondHalf - firstHalf)

  return (net + drawdown + kink) / norm
}
