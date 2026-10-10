import type { Redis } from '@upstash/redis'
import { SERVER_CONTROLLED_CAPS } from '~~/lib/round-beats'
import { seatInvariantViolations, type SeatViolation } from '~~/lib/seat-invariants'
import type { Game } from '~~/types/game.types'
import type { SeatRender } from '~~/types/seat.types'
import { enqueueGameTask, isDraining, useServerSideEvents, type GameServer } from '../server-side'
import { machineOwnsGame } from './game-ownership'
import { armedTimersFor } from './seat-cursor'
import { logSeatLine, rendersKey } from './seat-journal'

/**
 * The production auditor: a periodic, READ-ONLY sweep of every live room this
 * machine owns, running the shared seat invariants against the saved game,
 * the in-process timers and the viewers' render acks. Each new violation is
 * one structured `seat-audit` line — the frozen-until-refresh class becomes a
 * log search instead of a player report.
 */
export const SEAT_AUDIT_MS = 10_000
export const LIVE_ROOMS_KEY = 'debug:live-rooms'

type AuditRedis = Pick<Redis, 'hgetall' | 'zadd'>

export const readRenders = async (redis: unknown, gameId: string): Promise<SeatRender[]> => {
  const hashes = redis as Partial<AuditRedis>
  if (typeof hashes.hgetall !== 'function') return []
  const raw = (await hashes.hgetall(rendersKey(gameId))) ?? {}
  return Object.values(raw).map(value =>
    typeof value === 'string' ? (JSON.parse(value) as SeatRender) : (value as SeatRender)
  )
}

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
    armed: armedTimersFor(game.id).filter(timer => !timer.seat.startsWith('@')),
    renders: await readRenders(redis, game.id),
    connectedSeats,
  })

/** Violations already logged, so a standing fault is one line, not one per sweep. */
const reported = new Map<string, number>()
const reportKey = (gameId: string, violation: SeatViolation) =>
  `${gameId}|${violation.kind}|${violation.seat ?? ''}|${violation.detail.replace(/\d+ms/g, '')}`

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
        await redis.zadd(LIVE_ROOMS_KEY, { score: Date.now(), member: gameId })
        await enqueueGameTask(gameId, async () => {
          const game = await server.fetchGame(gameId)
          if (!game?.started) return
          reportViolations(gameId, await auditGame(redis, game, [...connected]))
        })
      })().catch(error => console.error(`Seat audit failed for ${gameId}`, error))
    }
  }, SEAT_AUDIT_MS)
  timer.unref?.()
}
