import { writeFileSync } from 'fs'
import { getCountryDataList } from 'countries-list'
import { type ISOCountryCode, isValidISOCode } from '../../../types/geography.types'

const OUTPUT_FILE = `data/owid.gen.ts`

/**
 * Our World in Data grapher CSVs — stable, ISO-coded mirrors of the major
 * governance indices. Each grapher slug exposes `?csvType=full` as clean CSV.
 *  - democracyIndex: V-Dem Electoral Democracy Index (0–1, higher = more democratic)
 *  - corruptionIndex: Transparency International CPI (0–100, higher = LESS corrupt)
 */
const METRICS = {
  democracyIndex: {
    slug: 'electoral-democracy-index',
    column: 'Electoral democracy index',
  },
  corruptionIndex: {
    slug: 'TI-corruption-perception-index',
    column: 'Corruption Perceptions Index',
  },
} as const

export type OwidMetric = { amount: number; year?: number }
export type OwidMapping = {
  [country in ISOCountryCode]?: {
    [metric in keyof typeof METRICS]?: OwidMetric
  }
}

/** Minimal RFC 4180 CSV parser (handles quoted fields with commas/newlines). */
const parseCSV = (text: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else {
      field += char
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter(cells => cells.some(cell => cell.length))
}

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
): Promise<Map<ISOCountryCode, OwidMetric>> => {
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

  // Keep the most recent year per country.
  const latest = new Map<ISOCountryCode, OwidMetric>()
  for (const row of rows) {
    const iso2 = lookup.get(row[codeIndex])
    if (!iso2) continue
    const value = Number(row[valueIndex])
    const year = Number(row[yearIndex])
    if (!Number.isFinite(value) || !Number.isFinite(year)) continue
    const existing = latest.get(iso2)
    if (!existing || year > (existing.year ?? 0)) latest.set(iso2, { amount: value, year })
  }
  return latest
}

export const createOwidMapping = async () => {
  const lookup = iso3ToIso2()
  const mapping: OwidMapping = {}

  for (const [metric, { slug, column }] of Object.entries(METRICS)) {
    console.info(`Fetching OWID metric ${metric} (${slug})`)
    const values = await fetchMetric(slug, column, lookup)
    for (const [iso2, value] of values) {
      mapping[iso2] = { ...mapping[iso2], [metric]: value }
    }
    console.info(`  ${values.size} countries`)
  }

  writeFileSync(
    OUTPUT_FILE,
    `
      import type { OwidMapping } from '../generators/vendors/owid/create-owid'
      export const owidMapping: OwidMapping = ${JSON.stringify(mapping)}
    `
  )
  console.info(`Wrote ${OUTPUT_FILE} (${Object.keys(mapping).length} countries)`)
}

createOwidMapping()
