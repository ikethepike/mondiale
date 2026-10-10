import type { Redis } from '@upstash/redis'
import { SERVER_CONTROLLED_CAPS } from '~~/lib/round-beats'
import { seatInvariantViolations, type SeatViolation } from '~~/lib/seat-invariants'
import type { Game } from '~~/types/game.types'
import {
  enqueueGameTask,
  GAME_STATE_TTL_SECONDS,
  isDraining,
  useServerSideEvents,
  type GameServer,
  type GameSocket,
} from '../server-side'
import { machineOwnsGame } from './game-ownership'
import { rearmLiveRound } from './rearm-round'
import { armedTimersFor } from './seat-cursor'
import { LIVE_ROOM_WINDOW_MS, LIVE_ROOMS_KEY, readRenders } from '~~/lib/debug-rooms'
import { logSeatLine } from './seat-journal'

/**
 * The production auditor: a periodic sweep of every live room this machine
 * owns, running the shared seat invariants against the saved game, the
 * in-process timers and the viewers' render acks. Each new violation is one
 * structured `seat-audit` line — the frozen-until-refresh class becomes a log
 * search instead of a player report. It never writes the game; a wait whose
 * timer is gone is re-armed from persisted state, as a rejoin would.
 */
export const SEAT_AUDIT_MS = 10_000
/** Run the invariants for one game with every piece of evidence this machine holds. */
export const auditGame = async (
  redis: unknown,
  game: Game,
  connectedSeats: readonly string[],
  now = Date.now()
): Promise<SeatViolation[]> =>
  seatInvariantViolations(game, {
    now,
    capsOn: SERVER_CONTROLLED_CAPS,
    armed: armedTimersFor(game.id),
    renders: await readRenders(redis, game.id),
    connectedSeats,
  })

/** Violations already logged, so a standing fault is one line, not one per sweep. */
const reported = new Map<string, number>()
const reportKey = (gameId: string, violation: SeatViolation) =>
  `${gameId}|${violation.kind}|${violation.seat ?? ''}|${violation.detail.replace(/\d+ms/g, '')}`

/** What a rearm from persisted state can heal: a wait whose timer is gone or never fired. */
const HEALABLE: readonly SeatViolation['kind'][] = [
  'overdue',
  'unarmed',
  'table-overdue',
  'table-unarmed',
  'round-overdue',
]
export const needsRearm = (violations: readonly SeatViolation[]) =>
  violations.some(violation => HEALABLE.includes(violation.kind))

export const reportViolations = (gameId: string, violations: readonly SeatViolation[]) => {
  const now = Date.now()
  for (const violation of violations) {
    const key = reportKey(gameId, violation)
    if (reported.has(key)) continue
    reported.set(key, now)
    logSeatLine('seat-audit', { game: gameId, ...violation, at: now })
  }
  for (const [key, at] of reported) {
    if (now - at > 3_600_000) reported.delete(key)
  }
}

/** Mark a room live; members past the window fall out, and the key lives no longer than a game. */
export const markLiveRoom = async (
  redis: Pick<Redis, 'zadd' | 'zremrangebyscore' | 'expire'>,
  gameId: string,
  now = Date.now()
) => {
  await redis.zadd(LIVE_ROOMS_KEY, { score: now, member: gameId })
  await redis.zremrangebyscore(LIVE_ROOMS_KEY, 0, now - LIVE_ROOM_WINDOW_MS)
  await redis.expire(LIVE_ROOMS_KEY, GAME_STATE_TTL_SECONDS)
}

/**
 * One room's sweep, inside its game queue: report what the invariants see,
 * and re-arm from persisted state when a wait has lost its timer — a fetch
 * that failed or a body that threw leaves no exit until someone rejoins, so
 * the sweep is the other recovery moment.
 */
export const sweepGame = async (
  { io, redis }: { io: GameServer; redis: Redis },
  game: Game,
  connectedSeats: readonly string[]
) => {
  const violations = await auditGame(redis, game, connectedSeats)
  reportViolations(game.id, violations)
  if (needsRearm(violations)) {
    logSeatLine('seat-heal', { game: game.id, at: Date.now() })
    rearmLiveRound(
      {
        io,
        redis,
        socket: {} as GameSocket,
        eventTarget: { gameId: game.id, playerId: game.host },
      },
      game
    )
  }
  return violations
}

let auditorStarted = false

export const startSeatAuditor = ({ io, redis }: { io: GameServer; redis: Redis }) => {
  if (auditorStarted) return
  auditorStarted = true
  const server = useServerSideEvents({ io, redis, socket: {} as never })
  const timer = setInterval(() => {
    if (isDraining()) return
    const rooms = new Map<string, Set<string>>()
    for (const socket of io.of('/').sockets.values()) {
      const { gameId, playerId } = socket.data
      if (!gameId) continue
      const seated = rooms.get(gameId) ?? new Set<string>()
      if (playerId) seated.add(playerId)
      rooms.set(gameId, seated)
    }
    for (const [gameId, connected] of rooms) {
      void (async () => {
        if (!(await machineOwnsGame(redis, gameId))) return
        await markLiveRoom(redis, gameId)
        await enqueueGameTask(gameId, async () => {
          const game = await server.fetchGame(gameId)
          if (game?.started) await sweepGame({ io, redis }, game, [...connected])
        })
      })().catch(error => console.error(`Seat audit failed for ${gameId}`, error))
    }
  }, SEAT_AUDIT_MS)
  timer.unref?.()
}
