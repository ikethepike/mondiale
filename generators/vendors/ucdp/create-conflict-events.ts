/**
 * Generates data/conflict-events.gen.ts — per-country "conflict fields" for the
 * flashpoint round — from the UCDP Georeferenced Event Dataset (GED). Events
 * are deduped onto a coarse grid, bucketed by era, capped, and projected with
 * the SAME fitted Robinson as the country map so the client renders plain
 * circles in viewBox space. Fatality figures only weight which cells survive
 * the cap — a shipped dot means "recorded clash here", nothing more.
 *
 *   bun run generate:conflict-events   (requires data/map.gen.ts)
 */
import { writeFileSync } from 'fs'
import { geoRobinson } from 'd3-geo-projection'
import {
  CONFLICTS_BY_COUNTRY,
  CONFLICTS_SUPPORTED_BY_COUNTRY,
} from '../../../data/conflict-profiles.gen'
import { MAP_PROJECTION } from '../../../data/map.gen'
import type { ISOCountryCode } from '../../../types/geography.types'
import type {
  ConflictFieldMapping,
  ConflictParticipation,
} from '../../../types/vendor/ucdp/ucdp.types'
import { columnLookup, fetchZippedCsv } from '../../lib/csv'
import { gwToISO } from './gwcodes'

const DATASET_VERSION = '25.1'
const DATASET_URL = `https://ucdp.uu.se/downloads/ged/ged${DATASET_VERSION.replace('.', '')}-csv.zip`

const OUT_FILE = 'data/conflict-events.gen.ts'

/** Era bucket per year; must match CONFLICT_ERAS in ucdp.types. */
const eraOf = (year: number) => (year < 2000 ? 0 : year < 2010 ? 1 : year < 2020 ? 2 : 3)

/** Events located no more precisely than ADM1 stay; country-centroid rows go. */
const MAX_WHERE_PRECISION = 4
/** Dedupe grid in degrees. */
const CELL_DEGREES = 0.2
/** Caps keep the shipped payload and the SVG dot budget small. */
const MAX_POINTS_PER_ERA = 120
/** The abroad layer is a reveal flourish — tighter caps, and countries with
 *  only incidental foreign presence don't ship one at all. */
const MAX_ABROAD_POINTS_PER_ERA = 60
const MIN_ABROAD_POINTS = 12

const projection = geoRobinson().scale(MAP_PROJECTION.scale).translate(MAP_PROJECTION.translate)

const main = async () => {
  console.info(`Downloading UCDP GED v${DATASET_VERSION} (large, build-time only)`)
  const rows = await fetchZippedCsv(DATASET_URL)
  const header = rows.shift()
  if (!header) throw new Error('GED CSV is empty')

  const column = columnLookup(header, 'UCDP GED')
  const year = column('year')
  const wherePrec = column('where_prec')
  const latitude = column('latitude')
  const longitude = column('longitude')
  const best = column('best')
  const countryId = column('country_id')
  const conflictNewId = column('conflict_new_id')

  // conflict id → every country that fought or supported it (ACD linkage;
  // non-state/one-sided ids simply never match). Requires generate:conflicts
  // to have run first.
  const involvedByConflict = new Map<number, Set<ISOCountryCode>>()
  const involvements: ConflictParticipation[] = [
    CONFLICTS_BY_COUNTRY,
    CONFLICTS_SUPPORTED_BY_COUNTRY,
  ]
  for (const mapping of involvements) {
    for (const [iso, ids] of Object.entries(mapping) as [ISOCountryCode, number[]][]) {
      for (const id of ids) {
        const involved = involvedByConflict.get(id) ?? new Set<ISOCountryCode>()
        involved.add(iso)
        involvedByConflict.set(id, involved)
      }
    }
  }

  // country → era → cell key → weight
  type CellStore = Map<ISOCountryCode, Map<number, Map<string, number>>>
  const cells: CellStore = new Map()
  // Same shape for the reveal's "engagements abroad" layer: events of a
  // country's conflicts located on someone else's soil.
  const abroadCells: CellStore = new Map()
  const accumulate = (store: CellStore, iso: ISOCountryCode, era: number, key: string, weight: number) => {
    const eras = store.get(iso) ?? new Map<number, Map<string, number>>()
    const eraCells = eras.get(era) ?? new Map<string, number>()
    eraCells.set(key, (eraCells.get(key) ?? 0) + weight)
    eras.set(era, eraCells)
    store.set(iso, eras)
  }

  let kept = 0
  for (const row of rows) {
    if (Number(row[wherePrec]) > MAX_WHERE_PRECISION) continue
    const iso = gwToISO.get(Number(row[countryId]))
    if (!iso) continue
    const lat = Number(row[latitude])
    const lon = Number(row[longitude])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

    const era = eraOf(Number(row[year]))
    const key = `${Math.floor(lon / CELL_DEGREES)}:${Math.floor(lat / CELL_DEGREES)}`
    const weight = 1 + Math.max(0, Number(row[best]) || 0)

    accumulate(cells, iso, era, key, weight)
    kept++

    for (const involved of involvedByConflict.get(Number(row[conflictNewId])) ?? []) {
      if (involved !== iso) accumulate(abroadCells, involved, era, key, weight)
    }
  }
  console.info(`Aggregated ${kept} events across ${cells.size} countries`)

  const shipFields = (store: CellStore, maxPerEra: number, minTotal = 0): ConflictFieldMapping => {
    const fields: ConflictFieldMapping = {}
    for (const [iso, eras] of store) {
      const shipped: { era: number; points: [number, number][] }[] = []
      for (const era of [...eras.keys()].sort((a, b) => a - b)) {
        const weighted = [...eras.get(era)!.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, maxPerEra)
        const points: [number, number][] = []
        const seen = new Set<string>()
        for (const [key] of weighted) {
          const [cellX, cellY] = key.split(':').map(Number)
          const projected = projection([
            (cellX + 0.5) * CELL_DEGREES,
            (cellY + 0.5) * CELL_DEGREES,
          ])
          if (!projected) continue
          const point: [number, number] = [Math.round(projected[0]), Math.round(projected[1])]
          const pointKey = `${point[0]}:${point[1]}`
          if (seen.has(pointKey)) continue
          seen.add(pointKey)
          points.push(point)
        }
        if (points.length) shipped.push({ era, points })
      }
      const total = shipped.reduce((sum, { points }) => sum + points.length, 0)
      if (!shipped.length || total < minTotal) continue
      fields[iso] = { total, eras: shipped }
    }
    return fields
  }

  const fields = shipFields(cells, MAX_POINTS_PER_ERA)
  const abroad = shipFields(abroadCells, MAX_ABROAD_POINTS_PER_ERA, MIN_ABROAD_POINTS)

  const output = `// Generated by generators/vendors/ucdp/create-conflict-events.ts — do not edit by hand.
// Source: UCDP GED v${DATASET_VERSION}, projected with the map's fitted Robinson (data/map.gen.ts).
import type { ConflictFieldMapping } from '../types/vendor/ucdp/ucdp.types'

export const CONFLICT_FIELDS: ConflictFieldMapping = ${JSON.stringify(fields)}
/** Reveal-only: events of a country's conflicts located on foreign soil. */
export const CONFLICT_FIELDS_ABROAD: ConflictFieldMapping = ${JSON.stringify(abroad)}
`
  writeFileSync(OUT_FILE, output)

  const bytes = Buffer.byteLength(output)
  console.info(
    `Output: ${(bytes / 1024).toFixed(0)} KB raw, ${(Bun.gzipSync(Buffer.from(output)).byteLength / 1024).toFixed(0)} KB gzip → ${OUT_FILE}`
  )
  const rich = Object.entries(fields).filter(([, field]) => field!.total >= 40 && field!.eras.length >= 2)
  console.info(`Countries: ${Object.keys(fields).length} total, ${rich.length} flashpoint-viable`)
}

await main()
