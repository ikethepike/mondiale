// Type-only generator imports: a value import would execute the generator,
// which self-invokes at module bottom.
import type { TrendMetricId as OwidTrendMetricId } from '~~/generators/vendors/owid/create-owid'
import type { WppTrendMetricId } from '~~/generators/vendors/unwpp/create-wpp'
import type {
  TrendMapping as GenericTrendMapping,
  TrendSeries,
} from '~~/generators/lib/trend-series'
import { MIN_TREND_POINTS, MIN_TREND_SPAN_YEARS } from '~~/generators/lib/trend-series'
import { formatCompact, formatNumber } from '~~/lib/number'
import type { ChallengeScale, ChallengeTopic } from '~~/types/challenge.type'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'

/** Every stored series id, across vendors (OWID + UN WPP). */
export type TrendMetricId = OwidTrendMetricId | WppTrendMetricId
export type TrendMapping = GenericTrendMapping<TrendMetricId>
export type { TrendPoint, TrendSeries } from '~~/generators/lib/trend-series'
export { MIN_TREND_POINTS, MIN_TREND_SPAN_YEARS }

// The merged per-country series table lives in lib/trends-data.ts (~1.2MB of
// data) so importing these helpers costs nothing — dealers await it, trend
// views import it statically.

/**
 * Shared decisiveness convention (same as the higher-lower duel gap): bounded
 * indices cluster tightly, so they need an absolute gap of 8% of the scale's
 * range; unbounded values a 15% relative gap.
 */
export const isDecisiveGap = (a: number, b: number, scale?: ChallengeScale): boolean => {
  if (scale) return Math.abs(a - b) >= (scale.max - scale.min) * 0.08
  return relativeGap(a, b) >= 0.15
}

/** |a − b| relative to the larger magnitude — the one relative-gap measure
 *  (0 when both are 0). Thresholds live at the call sites. */
export const relativeGap = (a: number, b: number): number => {
  const reference = Math.max(Math.abs(a), Math.abs(b))
  return reference > 0 ? Math.abs(a - b) / reference : 0
}

/**
 * The trend-challenge metric registry, one entry per stored series.
 * `mixed` marks metrics that genuinely trend both ways across the world —
 * required for direction questions (a rising/falling question about life
 * expectancy is a giveaway). `race` marks "moved the most" eligibility.
 * `invert` on a scale means higher = worse (corruption, inequality).
 * `glyph` points at the metric's bespoke stat emblem in STAT_GLYPHS — the
 * topic emblem is too generic on a card (internet use drew a bridge).
 */
export const TREND_METRICS: Record<
  TrendMetricId,
  {
    label: string
    unit: string
    topic: ChallengeTopic
    glyph?: GroupChallengeAccessorId
    scale?: ChallengeScale
    mixed: boolean
    race: boolean
  }
> = {
  democracyIndex: {
    label: 'democracy index',
    unit: 'index',
    topic: 'general knowledge',
    glyph: 'government.democracyIndex',
    scale: { min: 0, max: 1 },
    mixed: true,
    race: true,
  },
  humanDevelopmentIndex: {
    label: 'Human Development Index',
    unit: 'index',
    topic: 'general knowledge',
    glyph: 'government.humanDevelopmentIndex',
    scale: { min: 0, max: 1 },
    mixed: false,
    race: true,
  },
  politicalCorruption: {
    label: 'political corruption',
    unit: 'index',
    topic: 'general knowledge',
    glyph: 'government.corruptionIndex',
    scale: { min: 0, max: 1, invert: true },
    mixed: true,
    race: true,
  },
  co2PerCapita: {
    label: 'CO₂ emissions per person',
    unit: 't',
    topic: 'environment',
    glyph: 'environment.CO2Emissions',
    mixed: true,
    race: true,
  },
  lifeExpectancy: {
    label: 'life expectancy',
    unit: 'years',
    topic: 'health',
    glyph: 'people.lifeExpectancy',
    mixed: false,
    race: true,
  },
  fertility: {
    label: 'fertility rate',
    unit: 'children',
    topic: 'people',
    glyph: 'people.childrenPerWoman',
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
    glyph: 'infrastructure.internetAccess',
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
    glyph: 'economics.gdpTotal',
    mixed: false,
    race: true,
  },
  gdpPerCapita: {
    label: 'GDP per person',
    unit: '$',
    topic: 'economics',
    glyph: 'economics.gdpPerCapita',
    mixed: false,
    race: true,
  },
  gini: {
    label: 'income inequality',
    unit: 'index',
    topic: 'economics',
    glyph: 'economics.equality',
    // Real-world Gini coefficients span ~0.2–0.6; a 0–1 track would bury every
    // country in the middle and make the 8% decisiveness gap unreachable.
    scale: { min: 0.2, max: 0.6, invert: true },
    mixed: true,
    race: true,
  },
  alcoholConsumption: {
    label: 'alcohol consumption per person',
    unit: 'L',
    topic: 'health',
    glyph: 'health.alcoholConsumption',
    mixed: true,
    race: true,
  },
  obesity: {
    label: 'adult obesity',
    unit: '%',
    topic: 'health',
    glyph: 'health.obesity',
    // Prevalence spans ~2–60%; a 0–100 track would mute every move.
    scale: { min: 0, max: 60 },
    mixed: false,
    race: true,
  },
  tobaccoUse: {
    label: 'adult smoking',
    unit: '%',
    topic: 'health',
    glyph: 'health.tobaccoUse',
    scale: { min: 0, max: 60 },
    mixed: false,
    race: true,
  },
  militarySpending: {
    label: 'military spending share of GDP',
    unit: '% of GDP',
    topic: 'economics',
    glyph: 'economics.militarySpending',
    mixed: true,
    race: true,
  },
  renewables: {
    label: 'renewable share of electricity',
    unit: '%',
    topic: 'energy',
    glyph: 'environment.renewables',
    scale: { min: 0, max: 100 },
    mixed: true,
    race: true,
  },
  urbanization: {
    label: 'urban share of population',
    unit: '%',
    topic: 'people',
    glyph: 'people.urbanization',
    scale: { min: 0, max: 100 },
    mixed: false,
    race: true,
  },
  forested: {
    label: 'forest cover',
    unit: '%',
    topic: 'geography',
    glyph: 'geography.area.forested',
    scale: { min: 0, max: 100 },
    mixed: true,
    race: true,
  },
  meatConsumption: {
    label: 'meat consumption per person',
    unit: 'kg',
    topic: 'health',
    mixed: true,
    race: true,
  },
  touristArrivals: {
    label: 'international tourist arrivals',
    unit: 'tourists',
    topic: 'economics',
    mixed: false,
    race: true,
  },
  energyUse: {
    label: 'energy use per person',
    unit: 'kWh',
    topic: 'energy',
    mixed: true,
    race: true,
  },
  workingHours: {
    label: 'working hours per worker',
    unit: 'hours',
    topic: 'economics',
    mixed: false,
    race: true,
  },
  airPollution: {
    label: 'air pollution (PM2.5)',
    unit: 'µg/m³',
    topic: 'environment',
    mixed: true,
    race: true,
  },
  roadDeaths: {
    label: 'road deaths',
    unit: 'per 100k',
    topic: 'health',
    mixed: true,
    race: true,
  },
  redListIndex: {
    label: 'wildlife safety (Red List Index)',
    unit: 'index',
    topic: 'environment',
    // Real countries sit ~0.4–1 on the 0–1 index.
    scale: { min: 0.4, max: 1 },
    mixed: false,
    race: true,
  },
  freshwaterPerCapita: {
    label: 'freshwater per person',
    unit: 'm³',
    topic: 'environment',
    mixed: false,
    race: true,
  },
  population: {
    label: 'population',
    unit: 'people',
    topic: 'people',
    glyph: 'people.population',
    mixed: true,
    race: true,
  },
  medianAge: {
    label: 'median age',
    unit: 'years',
    topic: 'people',
    glyph: 'people.medianAge',
    // Country medians span ~15–52 years; a wider track would mute every move.
    scale: { min: 15, max: 55 },
    mixed: false,
    race: true,
  },
  motherMeanAgeAtBirth: {
    label: 'mean age of mothers',
    unit: 'years',
    topic: 'gender',
    glyph: 'gender.motherMeanAgeAtBirth',
    // Country means run ~26-33; a wider track would flatten a real shift.
    // Sweden moved 27.5 to 31.3 between 1960 and 2020, which is the story.
    scale: { min: 25, max: 35 },
    mixed: false,
    race: true,
  },
  birthRate: {
    label: 'birth rate',
    unit: 'per 1000',
    topic: 'people',
    glyph: 'people.birthRate',
    mixed: false,
    race: true,
  },
  netMigration: {
    label: 'net migration rate',
    unit: 'per 1000',
    topic: 'people',
    glyph: 'people.netMigration',
    // Crosses zero, so relative gaps misread near-balanced flows; real rates
    // sit within ±15 per 1000 outside war-and-boom outliers.
    scale: { min: -15, max: 15 },
    mixed: true,
    race: true,
  },
  populationGrowthRate: {
    label: 'population growth rate',
    unit: '%',
    topic: 'people',
    glyph: 'people.populationGrowthRate',
    // Also zero-crossing: shrinking Europe vs booming Gulf and Sahel.
    scale: { min: -2, max: 4 },
    mixed: true,
    race: true,
  },
}

export const TREND_METRIC_IDS = Object.keys(TREND_METRICS) as TrendMetricId[]

/** Units that lead the number rather than trail it. */
const PREFIX_UNITS = new Set(['$'])
/** Units that name a scale rather than measure one — mute them in a readout. */
const SILENT_UNITS = new Set(['index'])

/**
 * The one trend value renderer: '$1.2T', '61.3%', '83.4 years', '0.87'. Units
 * do not share one shape — '$' leads, '%' closes up, the rest trail a space —
 * so a lone suffix rule printed GDP as "1.2t $". Chart axes, tooltips, end
 * labels and the hidden data table all speak through this.
 * `compact` is the tight axis-tick voice; the default is the label voice.
 */
export const formatTrendValue = (
  amount: number,
  metric: TrendMetricId,
  options: { compact?: boolean } = {}
): string => {
  const { unit } = TREND_METRICS[metric]
  const currency = PREFIX_UNITS.has(unit)
  const number = options.compact
    ? formatCompact(amount, { currency })
    : currency
      ? `$${formatNumber(amount)}`
      : formatNumber(amount)
  // formatCompact already stamps the '$'; a bare scale name reads as noise.
  if (currency || SILENT_UNITS.has(unit)) return number
  return unit === '%' ? `${number}%` : `${number} ${unit}`
}

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
