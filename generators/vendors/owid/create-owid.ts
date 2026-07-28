import { writeFileSync } from 'fs'
import { getCountryDataList } from 'countries-list'
import { type ISOCountryCode, isValidISOCode } from '../../../types/geography.types'
import { toTrendSeries, type TrendMapping, type TrendPoint } from '../../lib/trend-series'
import { parseCSV } from '../../lib/csv'

const OUTPUT_FILE = `data/owid.gen.ts`
const TRENDS_OUTPUT_FILE = `data/trends.gen.ts`

/**
 * Our World in Data grapher CSVs — stable, ISO-coded mirrors of the major
 * governance indices. Each grapher slug exposes `?csvType=full` as clean CSV.
 * The download carries the FULL time series; besides the latest value per
 * country (data/owid.gen.ts) we keep a downsampled history per country
 * (data/trends.gen.ts) for the trend challenges.
 *  - democracyIndex: V-Dem Electoral Democracy Index (0–1, higher = more democratic)
 *  - corruptionIndex: Transparency International CPI (0–100, higher = LESS
 *    corrupt). `trend: false` — pre-2012 CPI used a different methodology, so
 *    its history isn't comparable; trends use politicalCorruption instead.
 *  - politicalCorruption: V-Dem Political Corruption Index (0–1, higher = MORE
 *    corrupt) — methodologically consistent across the whole series
 *  - humanDevelopmentIndex: UNDP HDI (0–1, higher = more developed)
 *  - happiness: World Happiness Report Cantril-ladder score (0–10, higher = happier)
 *  - gdp / gdpPerCapita: World Bank, constant international-$ (real, not nominal)
 *  - homicideRate: UNODC homicides per 100,000
 *  - gini: World Bank Gini coefficient (0–1 in this dataset, not 0–100)
 *
 * `decimals` sets series rounding; absent means 4 significant digits (GDP
 * values span nine orders of magnitude).
 */
const METRICS = {
  democracyIndex: {
    slug: 'electoral-democracy-index',
    column: 'Electoral democracy index',
    decimals: 3,
  },
  corruptionIndex: {
    slug: 'TI-corruption-perception-index',
    column: 'Corruption Perceptions Index',
    trend: false,
  },
  humanDevelopmentIndex: {
    slug: 'human-development-index',
    column: 'Human Development Index',
    decimals: 3,
  },
  happiness: {
    slug: 'happiness-cantril-ladder',
    column: 'Self-reported life satisfaction',
    // The WHR series only starts in 2011 — below MIN_TREND_SPAN_YEARS, so no
    // country produces a series yet. Revisit once the data matures.
    trend: false,
  },
  co2PerCapita: {
    slug: 'co-emissions-per-capita',
    column: 'CO₂ emissions per capita',
    decimals: 2,
  },
  lifeExpectancy: {
    slug: 'life-expectancy',
    column: 'Life expectancy',
    decimals: 1,
  },
  fertility: {
    slug: 'children-per-woman-un',
    column: 'Fertility rate',
    decimals: 2,
  },
  childMortality: {
    slug: 'child-mortality',
    column: 'Under-five mortality rate (selected)',
    decimals: 1,
  },
  internetUse: {
    slug: 'share-of-individuals-using-the-internet',
    column: 'Share of the population using the Internet',
    decimals: 1,
  },
  homicideRate: {
    slug: 'homicide-rate-unodc',
    column: 'Homicide rate per 100,000 population',
    decimals: 2,
  },
  politicalCorruption: {
    slug: 'political-corruption-index',
    column: 'Political Corruption Index',
    decimals: 3,
  },
  gdp: {
    slug: 'gdp-worldbank',
    column: 'GDP',
  },
  gdpPerCapita: {
    slug: 'gdp-per-capita-worldbank',
    column: 'GDP per capita',
  },
  gini: {
    slug: 'economic-inequality-gini-index',
    column: 'Gini coefficient',
    decimals: 3,
  },
  // Lifestyle/health — these feed EXISTING Country accessors (fresher, dated
  // values with history) rather than new stats; countries generator prefers
  // them over the undated Factbook nodes.
  alcoholConsumption: {
    slug: 'total-alcohol-consumption-per-capita-litres-of-pure-alcohol',
    column: 'Alcohol consumption',
    decimals: 2,
  },
  obesity: {
    slug: 'share-of-adults-defined-as-obese',
    column:
      'Obesity among adults, BMI >= 30 kg/m2 (crude estimate) (%) - Sex: both sexes - Age group: 18+  years of age',
    decimals: 1,
  },
  tobaccoUse: {
    slug: 'share-of-adults-who-smoke',
    column: 'Share of adults who smoke or use tobacco (age-standardized)',
    decimals: 1,
  },
  militarySpending: {
    slug: 'military-expenditure-share-gdp',
    column: 'Military expenditure (% of GDP)',
    decimals: 2,
  },
  renewables: {
    slug: 'share-electricity-renewables',
    column: 'Renewables',
    decimals: 1,
  },
  urbanization: {
    slug: 'share-of-population-urban',
    column: 'Urban',
    decimals: 1,
  },
  forested: {
    slug: 'forest-area-as-share-of-land-area',
    column: 'Share of land covered by forest',
    decimals: 1,
  },
  // New stats (new accessors on Country).
  meatConsumption: {
    slug: 'meat-supply-per-person',
    column: 'Per capita consumption of meat',
    decimals: 1,
  },
  touristArrivals: {
    slug: 'international-tourist-arrivals',
    column: 'Arrivals of tourists from abroad',
  },
  energyUse: {
    slug: 'per-capita-energy-use',
    column: 'Per capita energy consumption',
  },
  workingHours: {
    slug: 'annual-working-hours-per-worker',
    column: 'Working hours per worker',
    decimals: 0,
  },
  airPollution: {
    slug: 'pm25-air-pollution',
    column: 'Outdoor air pollution exposure (population-weighted PM2.5)',
    decimals: 1,
  },
  roadDeaths: {
    slug: 'death-rate-road-traffic-injuries',
    column:
      '3.6.1 - Death rate due to road traffic injuries, by sex (per 100,000 population) - SH_STA_TRAF - Both sexes',
    decimals: 1,
  },
  redListIndex: {
    slug: 'red-list-index',
    column: 'Red List Index',
    decimals: 3,
  },
  freshwaterPerCapita: {
    slug: 'renewable-water-resources-per-capita',
    column: 'Renewable internal freshwater resources per capita (cubic meters)',
  },
  // Scalar-only: the height series is indexed by birth cohort (ends ~1996),
  // EV sales cover only ~60 countries, and the two conservation counts are
  // essentially single-vintage snapshots.
  maleHeight: {
    slug: 'average-height-of-men',
    column: 'Mean male height (cm)',
    decimals: 1,
    trend: false,
  },
  evSalesShare: {
    slug: 'electric-car-sales-share',
    column: 'Share of new cars that are electric',
    decimals: 1,
    trend: false,
  },
  threatenedMammals: {
    slug: 'threatened-mammal-species',
    column: 'Mammal species, threatened',
    decimals: 0,
    trend: false,
  },
  protectedLand: {
    slug: 'terrestrial-protected-areas',
    column: 'Terrestrial protected areas (% of total land area)',
    decimals: 1,
    trend: false,
  },
} as const

type MetricId = keyof typeof METRICS

export type OwidMetric = { amount: number; year?: number }
export type OwidMapping = {
  [country in ISOCountryCode]?: {
    [metric in MetricId]?: OwidMetric
  }
}

export type TrendMetricId = {
  [K in MetricId]: (typeof METRICS)[K] extends { trend: false } ? never : K
}[MetricId]
export type OwidTrendMapping = TrendMapping<TrendMetricId>

/** OWID keys by ISO-3; build an ISO-3 -> ISO-2 lookup from countries-list. */
const iso3ToIso2 = (): Map<string, ISOCountryCode> => {
  const map = new Map<string, ISOCountryCode>()
  for (const { iso2, iso3 } of getCountryDataList()) {
    if (iso3 && isValidISOCode(iso2)) map.set(iso3, iso2)
  }
  return map
}

const fetchMetric = async (
  slug: string,
  column: string,
  lookup: Map<string, ISOCountryCode>
): Promise<{
  latest: Map<ISOCountryCode, OwidMetric>
  series: Map<ISOCountryCode, TrendPoint[]>
}> => {
  const response = await fetch(`https://ourworldindata.org/grapher/${slug}.csv?csvType=full`, {
    headers: { 'User-Agent': 'mondiale-generator' },
  })
  if (!response.ok) throw new Error(`OWID ${slug} returned ${response.status}`)

  const rows = parseCSV(await response.text())
  const header = rows.shift()
  if (!header) throw new Error(`OWID ${slug} CSV is empty`)

  const codeIndex = header.indexOf('Code')
  const yearIndex = header.indexOf('Year')
  const valueIndex = header.indexOf(column)
  if (codeIndex === -1 || yearIndex === -1 || valueIndex === -1) {
    throw new Error(`OWID ${slug} missing expected columns (got: ${header.join(', ')})`)
  }

  // Keep the most recent year per country, and every row for the series.
  const latest = new Map<ISOCountryCode, OwidMetric>()
  const series = new Map<ISOCountryCode, TrendPoint[]>()
  for (const row of rows) {
    const iso2 = lookup.get(row[codeIndex])
    if (!iso2) continue
    const value = Number(row[valueIndex])
    const year = Number(row[yearIndex])
    if (!Number.isFinite(value) || !Number.isFinite(year)) continue
    const existing = latest.get(iso2)
    if (!existing || year > (existing.year ?? 0)) latest.set(iso2, { amount: value, year })
    series.set(iso2, [...(series.get(iso2) ?? []), [year, value]])
  }
  return { latest, series }
}

export const createOwidMapping = async () => {
  const lookup = iso3ToIso2()
  const mapping: OwidMapping = {}
  const trends: OwidTrendMapping = {}

  for (const [metric, config] of Object.entries(METRICS)) {
    console.info(`Fetching OWID metric ${metric} (${config.slug})`)
    const { latest, series } = await fetchMetric(config.slug, config.column, lookup)
    for (const [iso2, value] of latest) {
      mapping[iso2] = { ...mapping[iso2], [metric]: value }
    }

    let kept = 0
    if (!('trend' in config)) {
      for (const [iso2, points] of series) {
        const trendSeries = toTrendSeries(
          points,
          'decimals' in config ? config.decimals : undefined
        )
        if (!trendSeries) continue
        trends[iso2] = { ...trends[iso2], [metric]: trendSeries }
        kept++
      }
    }
    console.info(`  ${latest.size} countries${'trend' in config ? '' : `, ${kept} series`}`)
  }

  writeFileSync(
    OUTPUT_FILE,
    `
      import type { OwidMapping } from '../generators/vendors/owid/create-owid'
      export const owidMapping: OwidMapping = ${JSON.stringify(mapping)}
    `
  )
  console.info(`Wrote ${OUTPUT_FILE} (${Object.keys(mapping).length} countries)`)

  writeFileSync(
    TRENDS_OUTPUT_FILE,
    `
      import type { OwidTrendMapping } from '../generators/vendors/owid/create-owid'
      export const TRENDS: OwidTrendMapping = ${JSON.stringify(trends)}
    `
  )
  console.info(`Wrote ${TRENDS_OUTPUT_FILE} (${Object.keys(trends).length} countries)`)
}

createOwidMapping()
