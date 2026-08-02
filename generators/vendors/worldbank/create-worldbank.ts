import { writeFileSync } from 'fs'
import { type ISOCountryCode, isValidISOCode } from '../../../types/geography.types'

const OUTPUT_FILE = `data/worldbank.gen.ts`

/**
 * World Bank indicators used to backfill metrics the CIA Factbook dropped.
 * Each is a percentage; we keep the most recent non-empty value per country.
 */
const INDICATORS = {
  womenInParliament: 'SG.GEN.PARL.ZS',
  contraceptivePrevalence: 'SP.DYN.CONU.ZS',
} as const

export type WorldBankMetric = { amount: number; year?: number }
export type WorldBankMapping = {
  [country in ISOCountryCode]?: {
    [metric in keyof typeof INDICATORS]?: WorldBankMetric
  }
}

const API = 'https://api.worldbank.org/v2'

interface WorldBankRow {
  id?: string
  iso2Code?: string
  countryiso3code?: string
  value?: number | null
  date?: string
}

// The WB API always answers with a [metadata, rows] pair.
const ATTEMPTS = 8
const fetchJson = async (url: string): Promise<[unknown, WorldBankRow[]?]> => {
  // The API rate-limits bursts — and shared CI egress IPs — with an XML error
  // body or a hung response. The weekly DataUpdate workflow rides this fetch,
  // so back off patiently instead of giving up inside half a minute.
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt) {
      const seconds = Math.min(15 * attempt, 60)
      console.info(`  rate-limited, retrying in ${seconds}s (${attempt}/${ATTEMPTS - 1})`)
      await new Promise(resolve => setTimeout(resolve, seconds * 1000))
    }
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'mondiale-generator' },
        signal: AbortSignal.timeout(30_000),
      })
      const text = await response.text()
      if (!text.startsWith('<')) return JSON.parse(text)
    } catch {
      // Hung or reset response — same treatment as a rate-limit body.
    }
  }
  throw new Error(`World Bank API kept returning a non-JSON (rate-limit) body: ${url}`)
}

/** World Bank keys countries by ISO-3; build an ISO-3 -> ISO-2 lookup. */
const fetchIso3ToIso2 = async (): Promise<Map<string, ISOCountryCode>> => {
  const map = new Map<string, ISOCountryCode>()
  const [, rows] = await fetchJson(`${API}/country?format=json&per_page=400`)
  for (const row of rows ?? []) {
    const iso2 = (row.iso2Code ?? '').toUpperCase()
    if (row.id && isValidISOCode(iso2)) map.set(row.id, iso2)
  }
  return map
}

const fetchIndicator = async (
  indicator: string,
  iso3ToIso2: Map<string, ISOCountryCode>
): Promise<Map<ISOCountryCode, WorldBankMetric>> => {
  // The API's mrnev param (most recent non-empty value) started answering 400
  // in mid-2026, so pull the full series and do the reduction ourselves.
  const out = new Map<ISOCountryCode, WorldBankMetric>()
  const latestYear = new Map<ISOCountryCode, number>()
  let pages = 1
  for (let page = 1; page <= pages; page++) {
    const [meta, rows] = await fetchJson(
      `${API}/country/all/indicator/${indicator}?format=json&per_page=20000&page=${page}`
    )
    pages = (meta as { pages?: number } | undefined)?.pages ?? 1
    for (const row of rows ?? []) {
      if (row.value == null) continue
      if (!row.countryiso3code) continue
      const iso2 = iso3ToIso2.get(row.countryiso3code)
      if (!iso2) continue
      const year = Number(row.date)
      if (!Number.isFinite(year) || year <= (latestYear.get(iso2) ?? -1)) continue
      latestYear.set(iso2, year)
      out.set(iso2, { amount: row.value, year })
    }
  }
  return out
}

export const createWorldBankMapping = async () => {
  console.info('Fetching World Bank ISO-3 -> ISO-2 lookup')
  const iso3ToIso2 = await fetchIso3ToIso2()

  const mapping: WorldBankMapping = {}
  for (const [metric, indicator] of Object.entries(INDICATORS)) {
    console.info(`Fetching World Bank indicator ${indicator} (${metric})`)
    const values = await fetchIndicator(indicator, iso3ToIso2)
    for (const [iso2, value] of values) {
      mapping[iso2] = { ...mapping[iso2], [metric]: value }
    }
    console.info(`  ${values.size} countries`)
  }

  writeFileSync(
    OUTPUT_FILE,
    `
      import type { WorldBankMapping } from '../generators/vendors/worldbank/create-worldbank'
      export const worldBankMapping: WorldBankMapping = ${JSON.stringify(mapping)}
    `
  )
  console.info(`Wrote ${OUTPUT_FILE} (${Object.keys(mapping).length} countries)`)
}

createWorldBankMapping()
