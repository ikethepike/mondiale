import { timingSafeEqual } from 'node:crypto'
import type { Redis } from '@upstash/redis'
import { SERVER_CONTROLLED_CAPS } from '~~/lib/round-beats'
import { seatInvariantViolations, type ArmedSeatTimer } from '~~/lib/seat-invariants'
import type { Game } from '~~/types/game.types'
import type { SeatJournalEntry, SeatRender } from '~~/types/seat.types'
import {
  eventsKey,
  journalKey,
  rendersKey,
  type SeatEventRecord,
} from '~~/lib/events/server/seat-journal'

/**
 * The read side of `/debug/rooms`: what a live room's seats are on, what they
 * last rendered, what is armed, the tail of the journal, and the invariants —
 * all from Redis plus the owning machine's timer registry. Read-only, and
 * only behind the debug token.
 */

export const DEBUG_JOURNAL_TAIL = 50
/** A room counts as live while the auditor saw a socket in it this recently. */
export const LIVE_ROOM_WINDOW_MS = 5 * 60_000
export const LIVE_ROOMS_KEY = 'debug:live-rooms'

export type DebugAccess = 'ok' | 'disabled' | 'denied'

/** No configured token disables the endpoint outright; a wrong one is denied. */
export const debugAccess = (
  configured: string | undefined,
  presented: string | undefined
): DebugAccess => {
  if (!configured) return 'disabled'
  if (!presented) return 'denied'
  const expected = Buffer.from(configured)
  const offered = Buffer.from(presented)
  return expected.length === offered.length && timingSafeEqual(expected, offered) ? 'ok' : 'denied'
}

/** The token from `Authorization: Bearer …` or `?token=` (a phone has no headers). */
export const presentedToken = (
  authorization: string | undefined,
  query: string | undefined
): string | undefined => authorization?.replace(/^Bearer\s+/i, '') || query || undefined

type ReadRedis = Pick<Redis, 'get' | 'lrange' | 'hgetall' | 'zrange'>

const parseEach = <T>(values: unknown[] | null | undefined): T[] =>
  (values ?? []).map(value => (typeof value === 'string' ? JSON.parse(value) : value) as T)

export const readRenders = async (redis: unknown, gameId: string): Promise<SeatRender[]> => {
  const raw = await (redis as ReadRedis).hgetall?.(rendersKey(gameId))
  return parseEach<SeatRender>(Object.values(raw ?? {}))
}

export const readJournal = async (
  redis: unknown,
  gameId: string,
  tail?: number
): Promise<SeatJournalEntry[]> =>
  parseEach<SeatJournalEntry>(
    await (redis as ReadRedis).lrange?.(journalKey(gameId), tail ? -tail : 0, -1)
  )

export interface DebugSeat {
  id: string
  name?: string
  bot?: true
  autopilot?: boolean
  step: string
  subject: string
  seq: number
  ageMs: number
  holdUntil?: number
  deadline?: number
  rendered?: { seq: number; step: string; subject: string; ageMs: number }
  armed?: { kind: string; seq: number; inMs: number }
}

export interface DebugRoom {
  id: string
  rev?: number
  started: boolean
  rounds: number
  nextRoundAt?: number
  seats: DebugSeat[]
  table?: { kind: string; inMs: number }
  journal: SeatJournalEntry[]
  violations: ReturnType<typeof seatInvariantViolations>
}

export const describeRoom = async ({
  redis,
  gameId,
  armed,
  now = Date.now(),
}: {
  redis: unknown
  gameId: string
  /** This machine's timers for the room; absent when another machine owns it. */
  armed?: readonly ArmedSeatTimer[]
  now?: number
}): Promise<DebugRoom | undefined> => {
  const game = (await (redis as ReadRedis).get<Game>(gameId)) ?? undefined
  if (!game?.players) return undefined
  const [renders, journal] = await Promise.all([
    readRenders(redis, gameId),
    readJournal(redis, gameId, DEBUG_JOURNAL_TAIL),
  ])
  const seats = Object.values(game.players).map((seat): DebugSeat => {
    const own = renders.find(render => render.seat === seat.id && render.viewer === seat.id)
    const timer = armed?.find(entry => entry.seat === seat.id)
    return {
      id: seat.id,
      name: seat.name,
      ...(seat.bot ? { bot: true as const } : {}),
      ...(seat.autopilot ? { autopilot: true } : {}),
      step: seat.cursor?.step,
      subject: seat.cursor?.subject,
      seq: seat.cursor?.seq,
      ageMs: now - (seat.cursor?.enteredAt ?? now),
      ...(seat.cursor?.holdUntil ? { holdUntil: seat.cursor.holdUntil } : {}),
      ...(seat.cursor?.deadline ? { deadline: seat.cursor.deadline } : {}),
      ...(own
        ? { rendered: { seq: own.seq, step: own.step, subject: own.subject, ageMs: now - own.at } }
        : {}),
      ...(timer ? { armed: { kind: timer.kind, seq: timer.seq, inMs: timer.fireAt - now } } : {}),
    }
  })
  const table = armed?.find(entry => entry.kind === 'next-round')
  return {
    id: game.id,
    rev: game.rev,
    started: game.started,
    rounds: game.rounds.length,
    ...(game.nextRoundAt ? { nextRoundAt: game.nextRoundAt } : {}),
    seats,
    ...(table ? { table: { kind: table.kind, inMs: table.fireAt - now } } : {}),
    journal,
    violations: seatInvariantViolations(game, {
      now,
      capsOn: SERVER_CONTROLLED_CAPS,
      armed: armed?.filter(entry => entry.kind !== 'next-round'),
      renders,
    }),
  }
}

/** Rooms the auditor saw with a live socket inside the window. */
export const liveRoomIds = async (redis: unknown, now = Date.now()): Promise<string[]> => {
  const members = await (redis as ReadRedis).zrange?.(
    LIVE_ROOMS_KEY,
    now - LIVE_ROOM_WINDOW_MS,
    now,
    {
      byScore: true,
    }
  )
  return (members ?? []).map(String)
}

type CheckpointRecord = Extract<SeatEventRecord, { kind: 'checkpoint' }>

export interface RoomExport {
  id: string
  checkpoint?: { at: number; game: Game; sides: Record<string, unknown> }
  journal: SeatJournalEntry[]
  events: SeatEventRecord[]
}

/**
 * Everything a replay needs: a round-start checkpoint (the latest, or the
 * earliest the ring still holds), every input recorded after it — in the
 * ring's order, which is the game's processing order — and the journal past
 * the checkpoint's own save.
 */
export const exportRoom = async (
  redis: unknown,
  gameId: string,
  from: 'latest' | 'earliest' = 'latest'
): Promise<RoomExport> => {
  const [journal, raw] = await Promise.all([
    readJournal(redis, gameId),
    (redis as ReadRedis).lrange?.(eventsKey(gameId), 0, -1),
  ])
  const records = parseEach<SeatEventRecord>(raw)
  const checkpoints = records.flatMap((record, index) =>
    record.kind === 'checkpoint' ? [{ record: record as CheckpointRecord, index }] : []
  )
  const chosen = from === 'latest' ? checkpoints.at(-1) : checkpoints[0]
  if (!chosen) return { id: gameId, journal: [], events: [] }
  const game = chosen.record.game as Game
  return {
    id: gameId,
    checkpoint: { at: chosen.record.at, game, sides: chosen.record.sides ?? {} },
    journal: journal.filter(entry => (entry.rev ?? 0) > (game.rev ?? 0)),
    events: records.slice(chosen.index + 1).filter(record => record.kind !== 'checkpoint'),
  }
}
