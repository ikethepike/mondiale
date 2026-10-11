/** What one playtest room writes to its `summary.json`, and the matrix reads back. */

/** The share of ticks whose `/debug/rooms` read must succeed for a room to count as checked. */
export const MIN_ROOM_READ_SHARE = 0.9

export interface PlaytestIncident {
  kind: string
  seat: string
  at: string
  detail: string
  selfHealedMs?: number
  healedByRefresh?: boolean
  healMs?: number
}

/** One human seat's run: how far the server actually moved it. */
export interface SeatProgress {
  seat: string
  name?: string
  subjects: number
  /** The fewest distinct subjects this room's length owes a live seat. */
  floor: number
  victory: boolean
  final: boolean
}

export interface PlaytestSummary {
  gameId: string
  finished: boolean
  minutes: number
  seats: number
  bots: number
  spectator: boolean
  /** The forced-gauntlet hook was on: some seat must have reached a `final:` subject. */
  forcedFinal: boolean
  reachedFinal: boolean
  /** True only when the server log exists and carried this game's own lines. */
  serverLogChecked: boolean
  /** Why it was not, when it was not: an external server's log is out of reach. */
  serverLogNote?: string
  roomReads: { ticks: number; read: number }
  progress: SeatProgress[]
  incidents: PlaytestIncident[]
  serverLines: string[]
  grammar: string[]
  warnings: string[]
  views: Record<string, string>
  subjects: Record<string, string[]>
}
