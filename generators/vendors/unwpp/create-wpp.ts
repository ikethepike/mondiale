import { jsonParseLiteral } from '../../lib/emit'
import { writeFileSync } from 'fs'
import { gunzipSync } from 'zlib'
import { type ISOCountryCode, isValidISOCode } from '../../../types/geography.types'
import { parseCSV } from '../../lib/csv'
import {
  toTrendSeries,
  roundAmount,
  type TrendMapping,
  type TrendPoint,
} from '../../lib/trend-series'

const SCALARS_OUTPUT_FILE = 'data/wpp.gen.ts'
const TRENDS_OUTPUT_FILE = 'data/wpp-trends.gen.ts'
const PYRAMIDS_OUTPUT_FILE = 'data/pyramids.gen.ts'

/**
 * UN World Population Prospects (2024 revision) — the open bulk CSVs, NOT the
 * Data Portal API: the API needs a bearer token and returns one row per
 * projection variant (a single country-year comes back as 17 rows), while one
 * CSV download carries every country and year. Rows are keyed by ISO2_code
 * directly. The "Medium" files hold estimates through LAST_ESTIMATE_YEAR and
 * medium-variant projections beyond it — projections never enter the game,
 * so everything clips there.
 */
const CSV_BASE =
  'https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES'
const INDICATORS_URL = `${CSV_BASE}/WPP2024_Demographic_Indicators_Medium.csv.gz`
const AGES_URL = `${CSV_BASE}/WPP2024_PopulationByAge5GroupSex_Medium.csv.gz`

/** The revision's last estimate year; later rows are projections. */
const LAST_ESTIMATE_YEAR = 2023

/**
 * Demographic-indicator columns → game metrics. `scale` converts the CSV's
 * unit (population is in thousands). `trend: false` metrics ship the latest
 * scalar only — lifeExpectancy and childrenPerWoman already have OWID series,
 * so WPP contributes just the fresher dated value.
 */
const INDICATOR_METRICS = {
  population: { column: 'TPopulation1July', scale: 1000, decimals: 0 },
  medianAge: { column: 'MedianAgePop', decimals: 1 },
  birthRate: { column: 'CBR', decimals: 1 },
  netMigration: { column: 'CNMR', decimals: 1 },
  populationGrowthRate: { column: 'PopGrowthRate', decimals: 2 },
  deathRate: { column: 'CDR', decimals: 1, trend: false },
  density: { column: 'PopDensity', decimals: 1, trend: false },
  sexRatio: { column: 'PopSexRatio', decimals: 1, trend: false },
  lifeExpectancy: { column: 'LEx', decimals: 1, trend: false },
  childrenPerWoman: { column: 'TFR', decimals: 2, trend: false },
} as const

type IndicatorMetricId = keyof typeof INDICATOR_METRICS
/** share65Plus comes from the age-structure file, not the indicators file. */
export type WppMetricId = IndicatorMetricId | 'share65Plus'

export type WppTrendMetricId = {
  [K in IndicatorMetricId]: (typeof INDICATOR_METRICS)[K] extends { trend: false } ? never : K
}[IndicatorMetricId]
export type WppTrendMapping = TrendMapping<WppTrendMetricId>

export type WppMetric = { amount: number; year: number }
export type WppMapping = {
  [country in ISOCountryCode]?: {
    [metric in WppMetricId]?: WppMetric
  }
}

/** 5-year cohorts, ascending; both arrays hold each cohort's share of the
 *  TOTAL population in percent, so male + female sum to ~100 across arrays. */
export const PYRAMID_AGE_GROUPS = [
  '0-4',
  '5-9',
  '10-14',
  '15-19',
  '20-24',
  '25-29',
  '30-34',
  '35-39',
  '40-44',
  '45-49',
  '50-54',
  '55-59',
  '60-64',
  '65-69',
  '70-74',
  '75-79',
  '80-84',
  '85-89',
  '90-94',
  '95-99',
  '100+',
] as const

export interface PopulationPyramid {
  year: number
  male: number[]
  female: number[]
}
export type PyramidMapping = {
  [country in ISOCountryCode]?: PopulationPyramid
}

const fetchGzippedCsv = async (url: string): Promise<string[][]> => {
  const response = await fetch(url, { headers: { 'User-Agent': 'mondiale-generator' } })
  if (!response.ok) throw new Error(`WPP ${url} returned ${response.status}`)
  return parseCSV(gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8'))
}

const columnIndex = (header: string[], column: string): number => {
  const index = header.indexOf(column)
  if (index === -1) throw new Error(`WPP CSV missing column ${column} (got: ${header.join(', ')})`)
  return index
}

export const createWppMapping = async () => {
  console.info('Fetching WPP demographic indicators')
  const rows = await fetchGzippedCsv(INDICATORS_URL)
  const header = rows.shift()
  if (!header) throw new Error('WPP indicators CSV is empty')

  const isoIndex = columnIndex(header, 'ISO2_code')
  const yearIndex = columnIndex(header, 'Time')
  const metricIndexes = Object.fromEntries(
    Object.entries(INDICATOR_METRICS).map(([metric, config]) => [
      metric,
      columnIndex(header, config.column),
    ])
  ) as Record<IndicatorMetricId, number>

  const mapping: WppMapping = {}
  const trends: WppTrendMapping = {}
  const series = new Map<ISOCountryCode, Map<IndicatorMetricId, TrendPoint[]>>()

  for (const row of rows) {
    const iso2 = row[isoIndex]
    if (!isValidISOCode(iso2)) continue
    const year = Number(row[yearIndex])
    if (!Number.isFinite(year) || year > LAST_ESTIMATE_YEAR) continue

    for (const [metric, config] of Object.entries(INDICATOR_METRICS)) {
      const metricId = metric as IndicatorMetricId
      const raw = Number(row[metricIndexes[metricId]])
      if (!Number.isFinite(raw)) continue
      const amount = raw * ('scale' in config ? config.scale : 1)

      const existing = mapping[iso2]?.[metricId]
      if (!existing || year > existing.year) {
        mapping[iso2] = {
          ...mapping[iso2],
          [metricId]: { amount: roundAmount(amount, config.decimals), year },
        }
      }

      if ('trend' in config) continue
      const byMetric = series.get(iso2) ?? new Map<IndicatorMetricId, TrendPoint[]>()
      byMetric.set(metricId, [...(byMetric.get(metricId) ?? []), [year, amount]])
      series.set(iso2, byMetric)
    }
  }

  let kept = 0
  for (const [iso2, byMetric] of series) {
    for (const [metric, points] of byMetric) {
      const trendSeries = toTrendSeries(points, INDICATOR_METRICS[metric].decimals)
      if (!trendSeries) continue
      trends[iso2] = { ...trends[iso2], [metric]: trendSeries }
      kept++
    }
  }
  console.info(`  ${Object.keys(mapping).length} countries, ${kept} series`)

  console.info('Fetching WPP population by age and sex')
  const ageRows = await fetchGzippedCsv(AGES_URL)
  const ageHeader = ageRows.shift()
  if (!ageHeader) throw new Error('WPP age CSV is empty')

  const ageIsoIndex = columnIndex(ageHeader, 'ISO2_code')
  const ageYearIndex = columnIndex(ageHeader, 'Time')
  const ageGroupIndex = columnIndex(ageHeader, 'AgeGrp')
  const ageStartIndex = columnIndex(ageHeader, 'AgeGrpStart')
  const maleIndex = columnIndex(ageHeader, 'PopMale')
  const femaleIndex = columnIndex(ageHeader, 'PopFemale')

  const cohorts = new Map<
    ISOCountryCode,
    Map<string, { start: number; male: number; female: number }>
  >()
  for (const row of ageRows) {
    if (Number(row[ageYearIndex]) !== LAST_ESTIMATE_YEAR) continue
    const iso2 = row[ageIsoIndex]
    if (!isValidISOCode(iso2)) continue
    const byGroup = cohorts.get(iso2) ?? new Map()
    byGroup.set(row[ageGroupIndex], {
      start: Number(row[ageStartIndex]),
      male: Number(row[maleIndex]),
      female: Number(row[femaleIndex]),
    })
    cohorts.set(iso2, byGroup)
  }

  const pyramids: PyramidMapping = {}
  let pyramidCount = 0
  for (const [iso2, byGroup] of cohorts) {
    if (byGroup.size !== PYRAMID_AGE_GROUPS.length) continue
    const total = [...byGroup.values()].reduce((sum, c) => sum + c.male + c.female, 0)
    if (!total) continue

    const percent = (value: number) => Number(((value / total) * 100).toFixed(2))
    pyramids[iso2] = {
      year: LAST_ESTIMATE_YEAR,
      male: PYRAMID_AGE_GROUPS.map(group => percent(byGroup.get(group)!.male)),
      female: PYRAMID_AGE_GROUPS.map(group => percent(byGroup.get(group)!.female)),
    }
    pyramidCount++

    const over65 = [...byGroup.values()]
      .filter(cohort => cohort.start >= 65)
      .reduce((sum, c) => sum + c.male + c.female, 0)
    mapping[iso2] = {
      ...mapping[iso2],
      share65Plus: {
        amount: Number(((over65 / total) * 100).toFixed(1)),
        year: LAST_ESTIMATE_YEAR,
      },
    }
  }
  console.info(`  ${pyramidCount} pyramids`)

  writeFileSync(
    SCALARS_OUTPUT_FILE,
    `
      import type { WppMapping } from '../generators/vendors/unwpp/create-wpp'
      export const wppMapping: WppMapping = ${JSON.stringify(mapping)}
    `
  )
  console.info(`Wrote ${SCALARS_OUTPUT_FILE} (${Object.keys(mapping).length} countries)`)

  writeFileSync(
    TRENDS_OUTPUT_FILE,
    `
      import type { WppTrendMapping } from '../generators/vendors/unwpp/create-wpp'
      export const WPP_TRENDS: WppTrendMapping = ${jsonParseLiteral(trends)}
    `
  )
  console.info(`Wrote ${TRENDS_OUTPUT_FILE} (${Object.keys(trends).length} countries)`)

  writeFileSync(
    PYRAMIDS_OUTPUT_FILE,
    `
      import type { PyramidMapping } from '../generators/vendors/unwpp/create-wpp'
      export const PYRAMIDS: PyramidMapping = ${JSON.stringify(pyramids)}
    `
  )
  console.info(`Wrote ${PYRAMIDS_OUTPUT_FILE} (${pyramidCount} countries)`)
}

createWppMapping()
