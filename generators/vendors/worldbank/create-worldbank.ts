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

const fetchJson = async (url: string): Promise<any> => {
  // The World Bank API rate-limits bursts with an XML error body; retry.
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': 'mondiale-generator' } })
    const text = await response.text()
    if (!text.startsWith('<')) return JSON.parse(text)
    await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
  }
  throw new Error(`World Bank API kept returning a non-JSON (rate-limit) body: ${url}`)
}

/** World Bank keys countries by ISO-3; build an ISO-3 -> ISO-2 lookup. */
const fetchIso3ToIso2 = async (): Promise<Map<string, ISOCountryCode>> => {
  const map = new Map<string, ISOCountryCode>()
  const [, rows] = await fetchJson(`${API}/country?format=json&per_page=400`)
  for (const row of rows ?? []) {
    const iso2 = (row.iso2Code ?? '').toUpperCase()
    if (isValidISOCode(iso2)) map.set(row.id, iso2)
  }
  return map
}

const fetchIndicator = async (
  indicator: string,
  iso3ToIso2: Map<string, ISOCountryCode>
): Promise<Map<ISOCountryCode, WorldBankMetric>> => {
  // mrnev=1 -> most recent non-empty value per country in a single page.
  const [, rows] = await fetchJson(
    `${API}/country/all/indicator/${indicator}?format=json&mrnev=1&per_page=400`
  )
  const out = new Map<ISOCountryCode, WorldBankMetric>()
  for (const row of rows ?? []) {
    if (row.value == null) continue
    const iso2 = iso3ToIso2.get(row.countryiso3code)
    if (!iso2) continue
    out.set(iso2, { amount: row.value, year: row.date ? Number(row.date) : undefined })
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
