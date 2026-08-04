import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { unzipSync, strFromU8 } from 'fflate'
import { type Amount, type ISOCountryCode } from '../../../types/geography.types'
import { resolveUnLocation } from './m49'

/**
 * Where the world's foreign-born live, from the UN DESA International Migrant
 * Stock bilateral matrix (origin × destination).
 *
 * Release-pinned and run BY HAND — the revision lands every four years or so
 * and the workbook is a 6MB xlsx, which keeps it off the weekly DataUpdate
 * cron (see .github/workflows/data-update.yml). To bump: raise IMS_REVISION,
 * delete .cache, rerun, and re-read the review table — the leading origin
 * changes for roughly a third of countries between revisions.
 *
 * The xlsx is read directly: an OOXML workbook is a zip of XML, and fflate
 * (already a dependency, via generators/lib/csv) unpacks it, so the parse
 * costs no new package. Only "Table 1" — the bilateral matrix — is read.
 *
 *   bun run generate:migration
 */
const IMS_REVISION = 2024
const CACHE_DIR = 'generators/vendors/undesa/.cache'
const WORKBOOK = `${CACHE_DIR}/undesa_ims_${IMS_REVISION}.xlsx`
const WORKBOOK_URL =
  'https://www.un.org/development/desa/pd/sites/www.un.org.development.desa.pd/files/' +
  `undesa_pd_${IMS_REVISION}_ims_stock_by_sex_destination_and_origin.xlsx`
const OUTPUT_FILE = 'data/migration.gen.ts'

/** The bilateral matrix; the workbook's other sheets are single-axis cuts. */
const MATRIX_SHEET = 'xl/worksheets/sheet2.xml'

/** How many corridors each direction keeps. The full matrix is ~8,800 live
 *  corridors; a mode never shows more than a handful, and the tail is where
 *  the rounding noise lives. */
const CORRIDORS_STORED = 6

/** Location codes at or above this are regional and development-group
 *  aggregates ("World", "Sub-Saharan Africa") — never countries. */
const AGGREGATE_CODE_FLOOR = 900

/** Coverage floor: a partial parse type-checks fine, so refuse to write one. */
const MINIMUM_COUNTRIES = 180

export interface MigrationCorridor {
  isoCode: ISOCountryCode
  value: Amount<'people'>
  /** Share of this country's total in that direction, 0–1. */
  share: number
}

export interface MigrationEntry {
  /** Where people born here now live, largest first. */
  destinations: MigrationCorridor[]
  /** Where this country's foreign-born residents were born, largest first. */
  origins: MigrationCorridor[]
  /** Shannon evenness of the origin mix, 0–1 — computed over every origin
   *  before truncation, so it describes the real population, not the head. */
  diversity?: number
}

export type MigrationMapping = { [isoCode in ISOCountryCode]?: MigrationEntry }

/**
 * Shannon evenness of a mix, 0–1: 1 is perfectly even, 0 a single dominant
 * share. Normalising by log(n) makes countries with different origin counts
 * comparable, which a raw entropy would not be.
 */
export const originEvenness = (values: readonly number[]): number | undefined => {
  const live = values.filter(value => value > 0)
  if (live.length < 2) return undefined
  const total = live.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return undefined
  const entropy = live.reduce((sum, value) => {
    const share = value / total
    return sum - share * Math.log(share)
  }, 0)
  return Number((entropy / Math.log(live.length)).toFixed(4))
}

const download = () => {
  if (existsSync(WORKBOOK)) return
  console.info(`Downloading UN DESA IMS ${IMS_REVISION} (~6MB) — hand-run only`)
  mkdirSync(CACHE_DIR, { recursive: true })
  const fetched = Bun.spawnSync([
    'curl',
    '-fsSL',
    '-A',
    'mondiale-generator',
    '-o',
    WORKBOOK,
    WORKBOOK_URL,
  ])
  if (fetched.exitCode !== 0) {
    throw new Error(`IMS download failed: ${fetched.stderr.toString()}`)
  }
}

/** Cell text, resolving the workbook's shared-string table. */
const cellValue = (attrs: string, body: string, shared: string[]): string => {
  const raw = /<v>(.*?)<\/v>/s.exec(body)?.[1] ?? ''
  if (!attrs.includes('t="s"')) return raw
  const index = Number(raw)
  return Number.isInteger(index) ? (shared[index] ?? '') : ''
}

/** One sheet row as a column-letter → text map. */
const rowCells = (row: string, shared: string[]): { [column: string]: string } => {
  const cells: { [column: string]: string } = {}
  for (const [, reference, attrs, body] of row.matchAll(
    /<c[^>]*r="([A-Z]+)\d+"([^>]*)>(.*?)<\/c>/gs
  )) {
    cells[/[A-Z]+/.exec(reference)![0]] = cellValue(attrs, body, shared)
  }
  return cells
}

const readMatrix = () => {
  const archive = unzipSync(new Uint8Array(readFileSync(WORKBOOK)))
  const sharedXml = archive['xl/sharedStrings.xml']
  const sheetXml = archive[MATRIX_SHEET]
  if (!sheetXml) throw new Error(`${MATRIX_SHEET} missing — the workbook's layout changed`)
  const shared = [...strFromU8(sharedXml ?? new Uint8Array()).matchAll(/<si>(.*?)<\/si>/gs)].map(
    ([, entry]) => entry.replace(/<[^>]+>/g, '')
  )
  const rows = [...strFromU8(sheetXml).matchAll(/<row[^>]*>(.*?)<\/row>/gs)].map(([, body]) =>
    rowCells(body, shared)
  )
  return { rows, shared }
}

/**
 * The matrix repeats its year columns three times — both sexes, then male,
 * then female. Only the first block is read, and the header is searched for
 * the revision year rather than a fixed column letter so a layout shift fails
 * loudly instead of silently reading the male sub-table.
 */
const locateColumns = (rows: { [column: string]: string }[]) => {
  for (const row of rows) {
    const entries = Object.entries(row)
    const destination = entries.find(([, text]) => /country or area of destination/i.test(text))
    if (!destination) continue
    const origin = entries.find(([, text]) => /country or area of origin/i.test(text))
    const year = entries.find(([, text]) => text.trim() === String(IMS_REVISION))
    if (!origin || !year) break
    return {
      destinationName: destination[0],
      originName: origin[0],
      stock: year[0],
    }
  }
  throw new Error(
    `Could not find the destination/origin/${IMS_REVISION} columns in ${MATRIX_SHEET} — the workbook's layout changed`
  )
}

const createMigrationFile = () => {
  download()
  const { rows } = readMatrix()
  const columns = locateColumns(rows)

  // origin -> destination -> people. Aggregates and non-playable territories
  // fall out here, so every downstream number is country-to-country.
  const flows = new Map<ISOCountryCode, Map<ISOCountryCode, number>>()
  let parsed = 0
  for (const row of rows) {
    const origin = resolveUnLocation(row[columns.originName] ?? '')
    const destination = resolveUnLocation(row[columns.destinationName] ?? '')
    if (!origin || !destination || origin === destination) continue
    const people = Number(row[columns.stock] ?? '')
    if (!Number.isFinite(people) || people <= 0) continue
    parsed++
    const byDestination = flows.get(origin) ?? new Map<ISOCountryCode, number>()
    byDestination.set(destination, (byDestination.get(destination) ?? 0) + people)
    flows.set(origin, byDestination)
  }
  console.info(`Read ${parsed} country-to-country corridors for ${IMS_REVISION}`)

  // The mirror view: who lives in each destination, by birthplace.
  const inbound = new Map<ISOCountryCode, Map<ISOCountryCode, number>>()
  for (const [origin, byDestination] of flows) {
    for (const [destination, people] of byDestination) {
      const byOrigin = inbound.get(destination) ?? new Map<ISOCountryCode, number>()
      byOrigin.set(origin, people)
      inbound.set(destination, byOrigin)
    }
  }

  const amount = (people: number): Amount<'people'> => ({
    amount: Math.round(people),
    unit: 'people',
    year: IMS_REVISION,
    source: 'un-migrant-stock-2024',
  })

  /** Shares are of the country's whole total, so a truncated list sums to
   *  less than 1 — the remainder is the long tail, not a rounding loss. */
  const toCorridors = (counts: Map<ISOCountryCode, number>): MigrationCorridor[] => {
    const total = [...counts.values()].reduce((sum, value) => sum + value, 0)
    return [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, CORRIDORS_STORED)
      .map(([isoCode, people]) => ({
        isoCode,
        value: amount(people),
        share: Number((people / total).toFixed(4)),
      }))
  }

  const mapping: MigrationMapping = {}
  for (const isoCode of new Set([...flows.keys(), ...inbound.keys()])) {
    const outbound = flows.get(isoCode)
    const arrivals = inbound.get(isoCode)
    mapping[isoCode] = {
      destinations: outbound ? toCorridors(outbound) : [],
      origins: arrivals ? toCorridors(arrivals) : [],
      diversity: arrivals ? originEvenness([...arrivals.values()]) : undefined,
    }
  }

  const countries = Object.keys(mapping).length
  if (countries < MINIMUM_COUNTRIES) {
    throw new Error(
      `Only ${countries} countries resolved (floor ${MINIMUM_COUNTRIES}) — check the M49 crosswalk or the workbook layout`
    )
  }

  // Review table — eyeball before committing. Each line should read like real
  // migration history; a surprise here usually means a crosswalk miss.
  const thousands = (people: number) => `${Math.round(people / 1000).toLocaleString()}k`
  for (const isoCode of (Object.keys(mapping) as ISOCountryCode[]).sort()) {
    const [leading] = mapping[isoCode]!.destinations
    if (!leading) continue
    console.info(
      `${isoCode}  →  ${leading.isoCode.padEnd(3)} ${thousands(leading.value.amount).padStart(9)}`
    )
  }

  writeFileSync(
    OUTPUT_FILE,
    `
      import type { MigrationMapping } from '../generators/vendors/undesa/create-migration'
      export const MIGRATION: MigrationMapping = ${JSON.stringify(mapping)}
    `
  )
  console.info(`Wrote ${OUTPUT_FILE} (${countries} countries)`)
}

createMigrationFile()
