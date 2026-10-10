import {
  applySeatMove,
  IllegalTransition,
  SEAT_STEP_SPECS,
  seatFireAt,
  tableOwesNextRound,
  type NextCursor,
  type SeatTimerKind,
} from '~~/lib/seat-transitions'
import { NEW_ROUND_PAUSE_MS, SERVER_CONTROLLED_CAPS } from '~~/lib/round-beats'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import type { SeatCause, SeatCursor, SeatJournalEntry } from '~~/types/seat.types'
import { setSeatSaveHooks, type GameServer, type GameSocket } from '../server-side'
import { scheduleEngineTask, type EngineContext } from './round-engine'
import { flushDeals, logSeatLine, recordSeatJournal } from './seat-journal'
import { migrateLegacySeats } from './seat-migrate'
import { revealNextRound, SEAT_TIMER_EXITS } from './seat-exits'
import type { Redis } from '@upstash/redis'

/**
 * The server's one way to move a seat. `advanceSeat` applies the move through
 * `applySeatMove` (validated against the transition table) and stamps it onto
 * the game in memory; the save home (`updateGameState`) then journals it and
 * arms the seat's one follow-up timer from the cursor's own stamps.
 */

const pending = new WeakMap<Game, SeatJournalEntry[]>()

export const capDeadline = (capMs: number, now = Date.now()): number | undefined =>
  SERVER_CONTROLLED_CAPS ? now + capMs : undefined

export const advanceSeat = (
  game: Game,
  seat: Player,
  next: NextCursor,
  cause: SeatCause,
  options: { progress?: true } = {}
): SeatCursor => {
  const from = seat.cursor.step
  try {
    applySeatMove(seat, next, cause)
  } catch (error) {
    if (error instanceof IllegalTransition) {
      logSeatLine('seat-illegal', {
        game: game.id,
        seat: seat.id,
        seq: seat.cursor.seq,
        from,
        to: next.step,
        cause,
        reason: error.message,
      })
    }
    throw error
  }
  const entries = pending.get(game) ?? []
  entries.push({
    game: game.id,
    seat: seat.id,
    seq: seat.cursor.seq,
    from,
    to: next.step,
    subject: next.subject,
    cause,
    at: seat.cursor.enteredAt,
    ...(options.progress ? { progress: true } : {}),
    ...(seat.bot
      ? { actor: 'bot' as const }
      : seat.autopilot
        ? { actor: 'autopilot' as const }
        : {}),
  })
  pending.set(game, entries)
  return seat.cursor
}

/** Transitions stamped in memory and not yet saved — the emit-breadth harness reads this. */
export const pendingSeatTransitions = (game: Game): readonly SeatJournalEntry[] =>
  pending.get(game) ?? []

const DETACHED_SOCKET = {} as GameSocket

interface ArmedTimer {
  seq: number
  kind: SeatTimerKind | 'next-round'
  fireAt: number
  handle: ReturnType<typeof setTimeout>
}
const armed = new Map<string, ArmedTimer>()
const tableKey = (gameId: string) => `${gameId}|@table`
const seatKey = (gameId: string, seatId: string) => `${gameId}|${seatId}`

/** What this process has armed for a game — the auditor and `/debug/rooms` read it. */
export const armedTimersFor = (
  gameId: string
): { seat: string; seq: number; kind: ArmedTimer['kind']; fireAt: number }[] =>
  [...armed.entries()]
    .filter(([key]) => key.startsWith(`${gameId}|`))
    .map(([key, timer]) => ({
      seat: key.slice(gameId.length + 1),
      seq: timer.seq,
      kind: timer.kind,
      fireAt: timer.fireAt,
    }))

/** Test seam: forget every in-process timer, as a restart would. */
export const dropArmedTimersForTests = () => {
  for (const timer of armed.values()) clearTimeout(timer.handle)
  armed.clear()
}

type ArmContext = { io: GameServer; redis: Redis }

const seatContext = (ctx: ArmContext, gameId: string, playerId: string): EngineContext => ({
  io: ctx.io,
  redis: ctx.redis,
  socket: DETACHED_SOCKET,
  eventTarget: { gameId, playerId },
})

/**
 * Arm the one timer a seat's cursor implies, capturing only `seq`. Idempotent:
 * re-arming the same seq is a no-op, a newer seq replaces the old timer, and
 * a step with no timer exit clears it.
 */
export const armSeat = (ctx: ArmContext, game: Game, seat: Player) => {
  const key = seatKey(game.id, seat.id)
  const existing = armed.get(key)
  const { seq, step } = seat.cursor
  const kind = SEAT_STEP_SPECS[step].timer
  const fireAt = seatFireAt(seat.cursor)
  if (!kind || fireAt === undefined) {
    if (existing && existing.seq < seq) {
      clearTimeout(existing.handle)
      armed.delete(key)
    }
    return
  }
  // Same seq: already armed. An older seq (a rearm from a stale snapshot)
  // must never displace the live seat's timer.
  if (existing && existing.seq >= seq) return
  if (existing) clearTimeout(existing.handle)
  const seatCtx = seatContext(ctx, game.id, seat.id)
  const handle = scheduleEngineTask(
    seatCtx,
    Math.max(0, fireAt - Date.now()),
    async (fresh, server) => {
      if (armed.get(key)?.handle === handle) armed.delete(key)
      const live = fresh.players[seat.id]
      if (!live?.cursor || live.cursor.seq !== seq) return
      await SEAT_TIMER_EXITS[kind]({ ctx: seatCtx, game: fresh, server, seat: live })
    }
  )
  armed.set(key, { seq, kind, fireAt, handle })
}

/** Arm the table's next-round reveal from `game.nextRoundAt`. */
export const armTable = (ctx: ArmContext, game: Game) => {
  const key = tableKey(game.id)
  const existing = armed.get(key)
  const fireAt = game.nextRoundAt
  if (fireAt === undefined) {
    if (existing) clearTimeout(existing.handle)
    armed.delete(key)
    return
  }
  if (existing?.fireAt === fireAt) return
  if (existing) clearTimeout(existing.handle)
  const tableCtx = seatContext(ctx, game.id, game.host)
  const handle = scheduleEngineTask(
    tableCtx,
    Math.max(0, fireAt - Date.now()),
    async (fresh, server) => {
      if (armed.get(key)?.handle === handle) armed.delete(key)
      if (fresh.nextRoundAt !== fireAt) return
      await revealNextRound(tableCtx, fresh, server)
    }
  )
  armed.set(key, { seq: 0, kind: 'next-round', fireAt, handle })
}

/**
 * Restart recovery: every seat re-arms whatever its cursor implies, and the
 * table re-arms its reveal. Safe beside live timers (same seq = no-op).
 */
export const rearmSeats = (ctx: ArmContext, game: Game) => {
  for (const seat of Object.values(game.players)) {
    if (seat.cursor) armSeat(ctx, game, seat)
  }
  armTable(ctx, game)
}

/** Stamp the next round the moment the last racer settles — in the SAME save. */
const stampTable = (game: Game) => {
  if (!game.started) return
  const owes = tableOwesNextRound(Object.values(game.players).map(seat => seat.cursor.step))
  if (owes && game.nextRoundAt === undefined) {
    game.nextRoundAt = Date.now() + NEW_ROUND_PAUSE_MS
    logSeatLine('table-journal', { game: game.id, nextRoundAt: game.nextRoundAt })
  } else if (!owes && game.nextRoundAt !== undefined) {
    delete game.nextRoundAt
  }
}

setSeatSaveHooks({
  afterFetch: game => {
    if (!migrateLegacySeats(game)) return
    stampTable(game)
    logSeatLine('seat-migrate', { game: game.id })
  },
  beforeSave: stampTable,
  afterSave: async (game, ctx) => {
    const entries = pending.get(game) ?? []
    pending.delete(game)
    for (const entry of entries) entry.rev = game.rev
    await recordSeatJournal(ctx.redis, entries)
    await flushDeals(ctx.redis, game)
    const moved = new Set(entries.map(entry => entry.seat))
    for (const seatId of moved) {
      const seat = game.players[seatId]
      if (seat) armSeat(ctx, game, seat)
    }
    armTable(ctx, game)
    return entries.length > 0
  },
})
