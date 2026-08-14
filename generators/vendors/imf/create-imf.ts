import { writeFileSync } from 'node:fs'
import { getCountryDataList } from 'countries-list'
import { type ISOCountryCode, isValidISOCode } from '../../../types/geography.types'
import { toTrendSeries, type TrendPoint } from '../../lib/trend-series'
import { jsonParseLiteral } from '../../lib/emit'

const OUTPUT_FILE = `data/imf.gen.ts`

/**
 * IMF DataMapper — the World Economic Outlook aggregates, as plain JSON.
 *
 * Here for one field the other vendors cannot cover. `economics.publicDebt` sat
 * on the CIA Factbook at a median vintage of 2017, and the Factbook mirror
 * stopped updating its data on 2026-01-22. The obvious replacement was the
 * World Bank's `GC.DOD.TOTL.GD.ZS`, and it is a trap: it reaches only 64 of our
 * countries against the Factbook's 190. Migrating would have gutted the stat
 * while the `source` field flipped and looked like a refresh. (The World Bank
 * generator's own header had already reached that conclusion independently.)
 *
 * The IMF reaches 186, losing only states it does not report on — Cuba, North
 * Korea, Libya, Monaco, Palestine, Somalia, Yemen and the Vatican — and every
 * one of those keeps its Factbook value, which the countries generator uses as
 * a backstop. Kosovo and Taiwan are both covered, which matters: they are
 * exactly the countries multilateral sources usually drop.
 *
 * Note the measure widens slightly: the Factbook quotes public debt, the IMF
 * quotes GENERAL GOVERNMENT GROSS debt, which folds in sub-national and
 * social-security borrowing. The stat's definition says so.
 *
 * No API key, no rate limit, one request per indicator for the whole world.
 * Values are percent of GDP and the series runs 1993 to the forecast horizon,
 * so this also gives the stat a history it never had.
 */

const API = 'https://www.imf.org/external/datamapper/api/v1'

const INDICATORS = {
  /** General government gross debt, % of GDP. */
  publicDebt: 'GGXWDG_NGDP',
} as const

type ImfMetricId = keyof typeof INDICATORS

export interface ImfMetric {
  amount: number
  year: number
}

export type ImfMapping = {
  [country in ISOCountryCode]?: { [metric in ImfMetricId]?: ImfMetric }
}
export type ImfTrendMapping = {
  [country in ISOCountryCode]?: { [metric in ImfMetricId]?: TrendPoint[] }
}

/**
 * The WEO publishes projections years ahead — 2031 at the time of writing — in
 * the same shape as observations, with nothing in the payload marking where one
 * ends and the other begins.
 *
 * A stat that reads "public debt" must be an OBSERVATION, so the cut is the
 * year BEFORE the current one: the WEO's last actual is the prior calendar
 * year, and everything from the current year on is a forecast. Taking `<= now`
 * shipped Sweden at 36.7% for 2026 — a projection presented as fact.
 */
const latestActual = (
  byYear: Record<string, number | null>,
  now: number
): ImfMetric | undefined => {
  const years = Object.keys(byYear)
    .map(Number)
    .filter(year => Number.isFinite(year) && year < now)
    .sort((a, b) => b - a)
  for (const year of years) {
    const value = byYear[String(year)]
    if (typeof value === 'number' && Number.isFinite(value)) return { amount: value, year }
  }
  return undefined
}

const iso3ToIso2 = (): Map<string, ISOCountryCode> => {
  const lookup = new Map<string, ISOCountryCode>()
  for (const { iso2, iso3 } of getCountryDataList()) {
    if (isValidISOCode(iso2)) lookup.set(iso3, iso2)
  }
  // The IMF files Kosovo under UVK where ISO 3166 uses XKX, and countries-list
  // carries neither — so without this the country drops silently.
  lookup.set('UVK', 'XK' as ISOCountryCode)
  return lookup
}

export const createImfMapping = async () => {
  const lookup = iso3ToIso2()
  const now = new Date().getFullYear()
  const mapping: ImfMapping = {}
  const trends: ImfTrendMapping = {}

  for (const [metric, indicator] of Object.entries(INDICATORS)) {
    console.info(`Fetching IMF ${metric} (${indicator})`)
    const response = await fetch(`${API}/${indicator}`)
    if (!response.ok) throw new Error(`IMF ${indicator}: HTTP ${response.status}`)
    const body = (await response.json()) as {
      values?: Record<string, Record<string, Record<string, number | null>>>
    }
    const values = body.values?.[indicator]
    if (!values) throw new Error(`IMF ${indicator}: no values in response`)

    let kept = 0
    let series = 0
    for (const [iso3, byYear] of Object.entries(values)) {
      const iso2 = lookup.get(iso3)
      if (!iso2) continue
      const value = latestActual(byYear, now)
      if (!value) continue
      mapping[iso2] = { ...mapping[iso2], [metric]: value }
      kept++

      const points: TrendPoint[] = Object.entries(byYear)
        .map(([year, amount]) => [Number(year), amount] as const)
        .filter(
          (point): point is [number, number] =>
            Number.isFinite(point[0]) && point[0] < now && typeof point[1] === 'number'
        )
        .map(([year, amount]) => [year, amount] as TrendPoint)
      const trendSeries = toTrendSeries(points, 1)
      if (trendSeries) {
        trends[iso2] = { ...trends[iso2], [metric]: trendSeries }
        series++
      }
    }
    console.info(`  ${kept} countries, ${series} series`)
  }

  writeFileSync(
    OUTPUT_FILE,
    `// Generated by generators/vendors/imf/create-imf.ts — do not edit by hand.\n` +
      `import type { ImfMapping, ImfTrendMapping } from '../generators/vendors/imf/create-imf'\n\n` +
      `export const IMF: ImfMapping = ${jsonParseLiteral(mapping)}\n\n` +
      `export const IMF_TRENDS: ImfTrendMapping = ${jsonParseLiteral(trends)}\n`
  )
  console.info(`Wrote ${OUTPUT_FILE} (${Object.keys(mapping).length} countries)`)
}

await createImfMapping()
