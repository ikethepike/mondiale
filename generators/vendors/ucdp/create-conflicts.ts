import { writeFileSync } from 'fs'
import { strFromU8, unzipSync } from 'fflate'
import { type ISOCountryCode, isValidISOCode } from '~~/types/geography.types'
import { GWToISOCode } from './gwcodes'

// The UCDP JSON API now requires an access token, but the packaged dataset
// downloads remain open — so we fetch the dyadic CSV release instead.
const DATASET_VERSION = '25.1'
const DATASET_URL = `https://ucdp.uu.se/downloads/dyadic/ucdp-dyadic-${DATASET_VERSION.replace('.', '')}-csv.zip`

const OUTPUT_FILE = `data/conflicts.gen.ts`

export type ConflictMapping = {
  [country in ISOCountryCode]?: {
    conflicts: number
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

export const createConflictsMapping = async () => {
  console.info(`Downloading UCDP dyadic dataset v${DATASET_VERSION}`)
  const response = await fetch(DATASET_URL)
  if (!response.ok) {
    throw new Error(`Failed to download UCDP dataset (${response.status}): ${DATASET_URL}`)
  }

  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()))
  const csvEntry = Object.keys(archive).find(name => name.toLowerCase().endsWith('.csv'))
  if (!csvEntry) throw new Error(`No CSV file found in UCDP archive: ${DATASET_URL}`)

  const rows = parseCSV(strFromU8(archive[csvEntry]))
  const header = rows.shift()
  if (!header) throw new Error('UCDP CSV is empty')

  const columnIndex = (name: string) => {
    const index = header.indexOf(name)
    if (index === -1) throw new Error(`Column "${name}" missing from UCDP CSV`)
    return index
  }

  const gwnoColumns = ['gwno_a', 'gwno_b'].map(columnIndex)
  const gwnoListColumns = ['gwno_a_2nd', 'gwno_b_2nd'].map(columnIndex)

  // Count how many conflict-year rows each Gleditsch & Ward state took part in
  const conflictsByGWCode = new Map<number, number>()
  const count = (value: string) => {
    const gwCode = Number(value)
    if (!value.trim() || Number.isNaN(gwCode)) return
    conflictsByGWCode.set(gwCode, (conflictsByGWCode.get(gwCode) ?? 0) + 1)
  }

  for (const row of rows) {
    for (const column of gwnoColumns) count(row[column])
    for (const column of gwnoListColumns) {
      for (const value of row[column].split(',')) count(value)
    }
  }

  const conflictMapping: ConflictMapping = {}
  for (const [isoCode, gwCode] of Object.entries(GWToISOCode)) {
    if (!isValidISOCode(isoCode)) continue // bypass unsupported nations
    conflictMapping[isoCode] = {
      conflicts: conflictsByGWCode.get(gwCode as number) ?? 0,
    }
  }

  writeFileSync(
    OUTPUT_FILE,
    `
      import type { ConflictMapping } from '../generators/vendors/ucdp/create-conflicts'
      export const conflictMapping: ConflictMapping = ${JSON.stringify(conflictMapping)}
    `
  )
  console.info(`Wrote ${OUTPUT_FILE} (${Object.keys(conflictMapping).length} countries)`)
}

createConflictsMapping()
