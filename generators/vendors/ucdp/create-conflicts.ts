import { writeFileSync } from 'fs'
import type { ISOCountryCode } from '~~/types/geography.types'
import {
  CONFLICT_TYPES,
  INCOMPATIBILITIES,
  type ConflictMapping,
  type ConflictMetrics,
  type ConflictParticipation,
  type ConflictSummary,
} from '~~/types/vendor/ucdp/ucdp.types'
import { columnLookup, fetchZippedCsv } from '../../lib/csv'
import { gwToISO } from './gwcodes'

// The UCDP JSON API now requires an access token, but the packaged dataset
// downloads remain open — so we fetch the conflict-year CSV release instead.
const DATASET_VERSION = '25.1'
const DATASET_URL = `https://ucdp.uu.se/downloads/ucdpprio/ucdp-prio-acd-${DATASET_VERSION.replace('.', '')}-csv.zip`

const METRICS_FILE = 'data/conflicts.gen.ts'
const PROFILES_FILE = 'data/conflict-profiles.gen.ts'

/** Rolling window for the "recent conflicts" metric, pinned to the dataset. */
const RECENT_YEARS = 5

const WAR_INTENSITY = 2

type ConflictYearRow = {
  year: number
  sideA: string[]
  sideB: string[]
  incompatibility: number
  territory: string
  intensity: number
  type: number
  location: string
  primaries: Set<ISOCountryCode>
  secondaries: Set<ISOCountryCode>
}

const splitList = (value: string) =>
  value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)

export const createConflictsMapping = async () => {
  console.info(`Downloading UCDP/PRIO armed conflict dataset v${DATASET_VERSION}`)
  const rows = await fetchZippedCsv(DATASET_URL)
  const header = rows.shift()
  if (!header) throw new Error('UCDP CSV is empty')

  const column = columnLookup(header, 'UCDP/PRIO ACD')
  const conflictId = column('conflict_id')
  const location = column('location')
  const sideA = column('side_a')
  const sideB = column('side_b')
  const incompatibility = column('incompatibility')
  const territoryName = column('territory_name')
  const year = column('year')
  const intensityLevel = column('intensity_level')
  const typeOfConflict = column('type_of_conflict')
  const gwnoA = column('gwno_a')
  const gwnoB = column('gwno_b')
  const gwnoA2nd = column('gwno_a_2nd')
  const gwnoB2nd = column('gwno_b_2nd')

  const partiesFrom = (row: string[], columns: number[]): Set<ISOCountryCode> => {
    const parties = new Set<ISOCountryCode>()
    for (const index of columns) {
      for (const value of splitList(row[index])) {
        const iso = gwToISO.get(Number(value))
        if (iso) parties.add(iso)
      }
    }
    return parties
  }

  // Primary parties only — secondary supporters do not count as participation.
  const primaryParties = (row: string[]) => partiesFrom(row, [gwnoA, gwnoB])
  // …but they DO make the profiles: "sent forces into Korea's war" is the
  // story of the interventionist powers, display-only, never a metric.
  const secondaryParties = (row: string[]) => partiesFrom(row, [gwnoA2nd, gwnoB2nd])

  const byConflict = new Map<number, ConflictYearRow[]>()
  let maxYear = 0
  for (const row of rows) {
    const id = Number(row[conflictId])
    if (!Number.isFinite(id)) continue
    const parsed: ConflictYearRow = {
      year: Number(row[year]),
      sideA: splitList(row[sideA]),
      sideB: splitList(row[sideB]),
      incompatibility: Number(row[incompatibility]),
      territory: row[territoryName].trim(),
      intensity: Number(row[intensityLevel]),
      type: Number(row[typeOfConflict]),
      location: row[location].trim(),
      primaries: primaryParties(row),
      secondaries: secondaryParties(row),
    }
    maxYear = Math.max(maxYear, parsed.year)
    const existing = byConflict.get(id)
    if (existing) existing.push(parsed)
    else byConflict.set(id, [parsed])
  }

  const metricsByISO = new Map<ISOCountryCode, ConflictMetrics & { warYears: Set<number> }>()
  const metricsFor = (iso: ISOCountryCode) => {
    let metrics = metricsByISO.get(iso)
    if (!metrics) {
      metrics = { total: 0, yearsAtWar: 0, recent: 0, warYears: new Set() }
      metricsByISO.set(iso, metrics)
    }
    return metrics
  }

  const conflicts: Record<number, ConflictSummary> = {}
  const participation: ConflictParticipation = {}
  const support: ConflictParticipation = {}

  for (const [id, conflictRows] of byConflict) {
    conflictRows.sort((a, b) => a.year - b.year)
    const latest = conflictRows[conflictRows.length - 1]
    const participants = new Set<ISOCountryCode>()
    const supporters = new Set<ISOCountryCode>()
    const episodes: [number, number][] = []
    let reachedWar = false

    for (const row of conflictRows) {
      const lastEpisode = episodes[episodes.length - 1]
      if (lastEpisode && row.year <= lastEpisode[1] + 1) lastEpisode[1] = Math.max(lastEpisode[1], row.year)
      else episodes.push([row.year, row.year])
      if (row.intensity === WAR_INTENSITY) reachedWar = true

      for (const iso of row.primaries) {
        participants.add(iso)
        if (row.intensity === WAR_INTENSITY) metricsFor(iso).warYears.add(row.year)
      }
      for (const iso of row.secondaries) supporters.add(iso)
    }

    for (const iso of supporters) {
      if (participants.has(iso)) continue
      const ids = (support[iso] ??= [])
      ids.push(id)
    }

    const recentlyActive = conflictRows.some(row => row.year > maxYear - RECENT_YEARS)
    for (const iso of participants) {
      const metrics = metricsFor(iso)
      metrics.total += 1
      if (recentlyActive) metrics.recent += 1
      const ids = (participation[iso] ??= [])
      ids.push(id)
    }

    const type = CONFLICT_TYPES[latest.type as keyof typeof CONFLICT_TYPES]
    const fought = INCOMPATIBILITIES[latest.incompatibility as keyof typeof INCOMPATIBILITIES]
    if (!type || !fought) throw new Error(`Unknown type/incompatibility codes on conflict ${id}`)

    const territorial = fought !== 'government' && latest.territory
    conflicts[id] = {
      id,
      name: territorial && latest.territory !== latest.location ? `${latest.location}: ${latest.territory}` : latest.location,
      sideA: latest.sideA,
      sideB: latest.sideB,
      episodes,
      type,
      incompatibility: fought,
      ...(territorial ? { territory: latest.territory } : {}),
      reachedWar,
    }
  }

  const conflictMapping: ConflictMapping = {}
  for (const iso of gwToISO.values()) {
    const metrics = metricsByISO.get(iso)
    conflictMapping[iso] = {
      total: metrics?.total ?? 0,
      yearsAtWar: metrics?.warYears.size ?? 0,
      recent: metrics?.recent ?? 0,
    }
  }

  writeFileSync(
    METRICS_FILE,
    `
      import type { ConflictMapping } from '../types/vendor/ucdp/ucdp.types'
      export const conflictMapping: ConflictMapping = ${JSON.stringify(conflictMapping)}
    `
  )
  console.info(`Wrote ${METRICS_FILE} (${Object.keys(conflictMapping).length} countries, data through ${maxYear})`)

  writeFileSync(
    PROFILES_FILE,
    `
      import type { ConflictParticipation, ConflictSummary } from '../types/vendor/ucdp/ucdp.types'
      export const CONFLICTS: Record<number, ConflictSummary> = ${JSON.stringify(conflicts)}
      export const CONFLICTS_BY_COUNTRY: ConflictParticipation = ${JSON.stringify(participation)}
      /** Secondary-party roles (troops in another state's conflict) — display-only, never a metric. */
      export const CONFLICTS_SUPPORTED_BY_COUNTRY: ConflictParticipation = ${JSON.stringify(support)}
    `
  )
  console.info(`Wrote ${PROFILES_FILE} (${Object.keys(conflicts).length} conflicts)`)
}

createConflictsMapping()
