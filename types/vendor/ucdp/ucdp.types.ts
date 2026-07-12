import type { ISOCountryCode } from '../../geography.types'

/** UCDP/PRIO ACD `type_of_conflict` codes. */
export const CONFLICT_TYPES = {
  1: 'colonial',
  2: 'interstate',
  3: 'civil war',
  4: 'internationalized civil war',
} as const
export type ConflictType = (typeof CONFLICT_TYPES)[keyof typeof CONFLICT_TYPES]

/** UCDP/PRIO ACD `incompatibility` codes. */
export const INCOMPATIBILITIES = {
  1: 'territory',
  2: 'government',
  3: 'both',
} as const
export type Incompatibility = (typeof INCOMPATIBILITIES)[keyof typeof INCOMPATIBILITIES]

/** Primary-party participation only — secondary supporters are excluded. */
export interface ConflictMetrics {
  /** Distinct conflicts since 1946. */
  total: number
  /** Calendar years since 1946 with a conflict at war intensity (≥1000 battle deaths). */
  yearsAtWar: number
  /** Distinct conflicts active in the dataset's last five years. */
  recent: number
}

export type ConflictMapping = {
  [country in ISOCountryCode]?: ConflictMetrics
}

export interface ConflictSummary {
  /** UCDP `conflict_id`. */
  id: number
  /** Location, suffixed with the contested territory when territorial. */
  name: string
  /** Primary parties as of the latest active year. */
  sideA: string[]
  sideB: string[]
  /** Active years merged into inclusive [from, to] spans. */
  episodes: [number, number][]
  type: ConflictType
  incompatibility: Incompatibility
  territory?: string
  /** Reached war intensity (≥1000 battle deaths) in at least one year. */
  reachedWar: boolean
}

/** Conflict ids per country, primary party only. */
export type ConflictParticipation = {
  [country in ISOCountryCode]?: number[]
}

/** Display copy per conflict type — shared by the reveal card and the
 *  flashpoint dealer's late hint, so the vocabulary never drifts. */
// "Internal conflict", not "civil war": UCDP's intrastate category includes
// cases like US–al-Qaida (the challenged government defines the location),
// where "civil war" would be actively misleading.
export const CONFLICT_TYPE_LABELS: Record<ConflictType, string> = {
  colonial: 'Colonial conflict',
  interstate: 'War between states',
  'civil war': 'Internal conflict',
  'internationalized civil war': 'Internal conflict (internationalized)',
}

/** What the fighting is over, in plain words. Never names the territory —
 *  hint copy must not hand the round over ("Kashmir" IS the answer). */
export const INCOMPATIBILITY_LABELS: Record<Incompatibility, string> = {
  territory: 'territory',
  government: 'who governs',
  both: 'territory & government',
}

export const conflictActiveYears = (summary: ConflictSummary): number =>
  summary.episodes.reduce((sum, [from, to]) => sum + (to - from + 1), 0)

/** A country's defining conflict: the one active the longest. */
export const dominantConflict = (profiles: ConflictSummary[]): ConflictSummary | undefined =>
  profiles.length
    ? profiles.reduce((a, b) => (conflictActiveYears(a) >= conflictActiveYears(b) ? a : b))
    : undefined

/** GED event coverage windows, oldest first. Index = `era` below. */
export const CONFLICT_ERAS = ['1989–1999', '2000–2009', '2010–2019', '2020s'] as const

/** GED events collapsed into map-space dots ("recorded clash here" — nothing more). */
export interface ConflictField {
  /** Total shipped points across eras. */
  total: number
  /** Points are [x, y] in the world map's projected viewBox space. */
  eras: { era: number; points: [number, number][] }[]
}

export type ConflictFieldMapping = {
  [country in ISOCountryCode]?: ConflictField
}
