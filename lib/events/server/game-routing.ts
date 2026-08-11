import type { Redis } from '@upstash/redis'
import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { isDraining, type GameServer } from '../server-side'
import { claimGameOwnership, thisMachineId } from './game-ownership'

const SOCKET_PATH = '/socket.io/'

/** How long a non-socket.io upgrade may wait for another consumer before the
 *  takeover ends it — engine.io's own destroyUpgradeTimeout beat. */
const DESTROY_UPGRADE_DELAY_MS = 1000

/** Claiming mints a Redis key from an unauthenticated query param, so the id
 *  must at least look like a room id — junk (or unbounded) values are treated
 *  as no gameId and never touch the lease space. */
const GAME_ID_PATTERN = /^[\w-]{1,64}$/

/** The subset of engine.io's server the takeover delegates to. */
interface EngineLike {
  use(fn: (req: IncomingMessage, res: ServerResponse, next: (err?: Error) => void) => void): void
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void
}

const gameIdFromUrl = (url: string | undefined): string | undefined => {
  const query = url?.split('?')[1]
  if (!query) return undefined
  const gameId = new URLSearchParams(query).get('gameId')
  return gameId && GAME_ID_PATTERN.test(gameId) ? gameId : undefined
}

/**
 * Room sharding at the front door: every socket connection carries its room
 * id in the URL (the client's manager `query`), and the machine that answers
 * it either owns that game or tells Fly's proxy to replay the request to the
 * machine that does. All of a room's sockets therefore land on ONE machine,
 * which is what keeps the in-process broadcasts, the per-game task queue and
 * the engine timers correct without a Redis adapter or distributed locks.
 * A connection with no gameId (the home page) is served locally — its room
 * binding happens later, through useJoinRoom's re-connect with the query set.
 *
 * Two seams, because engine.io exposes two:
 * - The websocket UPGRADE never reaches engine middlewares with a real
 *   response (their `WebSocketResponse` stub drops headers on the floor), so
 *   upgrades are intercepted at the HTTP server itself: engine.io's own
 *   upgrade listener is replaced with one that resolves ownership FIRST and
 *   only then hands the socket to `engine.handleUpgrade` — or answers the raw
 *   replay response and never lets the handshake start.
 * - Polling requests DO reach `engine.use` with a real ServerResponse, so the
 *   replay header rides a normal response there. Current clients are
 *   websocket-only; this leg keeps pre-transport-change bundles (and any
 *   future polling fallback) correctly routed, one replayed request at a time.
 *
 * Ownership checks fail OPEN (serve locally): a Redis blip must not refuse
 * the whole room, and the timer guard in deferred-task.ts still keeps two
 * machines from writing the same game.
 */
let routingRegistered = false

export const registerGameRouting = ({
  io,
  redis,
  httpServer,
}: {
  io: GameServer
  redis: Redis
  httpServer: HttpServer
}) => {
  const self = thisMachineId()
  if (!self || routingRegistered) return
  routingRegistered = true

  const engine = io.engine as unknown as EngineLike

  engine.use((req, res, next) => {
    // A draining machine takes no new sessions: refuse hard, so the client
    // retries until the lease moves to the live machine (see the drain's
    // writes-before-release ordering in graceful-shutdown.ts).
    if (isDraining()) {
      res.writeHead(503)
      res.end()
      return
    }

    const gameId = gameIdFromUrl(req.url)
    const query = req.url?.split('?')[1]
    const transport = query ? new URLSearchParams(query).get('transport') : undefined
    // Upgrades are routed by the listener below; websocket requests that got
    // this far are already on the right machine.
    if (!gameId || transport !== 'polling') return next()

    claimGameOwnership(redis, gameId, self)
      .then(owner => {
        if (owner === self) return next()
        res.writeHead(409, { 'fly-replay': `instance=${owner}` })
        res.end()
      })
      .catch(() => next())
  })

  // Replace engine.io's upgrade listener (registered by `new Server(http)`)
  // with the routing one. Production only (guarded by FLY_MACHINE_ID above),
  // so a dev server's HMR websocket is never touched.
  httpServer.removeAllListeners('upgrade')
  httpServer.on('upgrade', (req, socket, head) => {
    // FIRST, before any await gap: a raw Duplex with no 'error' listener
    // turns an abrupt client reset (ECONNRESET during the ownership claim,
    // or on the 409 write below) into a process-fatal 'error' emit.
    socket.on('error', error => {
      console.warn(`Upgrade socket error for ${req.url}: ${(error as Error).message}`)
    })

    if (!req.url?.startsWith(SOCKET_PATH)) {
      // Mirror engine.io's own destroyUpgrade: give any other upgrade
      // consumer a beat, then end the socket only if nothing answered it —
      // and drop the timer when the socket dies first, or every foreign
      // upgrade retains req/head for the full beat.
      const raw = socket as Duplex & { bytesWritten?: number }
      const timer = setTimeout(() => {
        if (raw.writable && (raw.bytesWritten ?? 0) <= 0) raw.end()
      }, DESTROY_UPGRADE_DELAY_MS)
      raw.once('close', () => clearTimeout(timer))
      return
    }

    // Refuse new sessions while draining (same rationale as the middleware
    // leg above) — the destroyed socket is a retry, not an error, client-side.
    if (isDraining()) return socket.destroy()

    const admit = () => engine.handleUpgrade(req, socket, head)
    const gameId = gameIdFromUrl(req.url)
    if (!gameId) return admit()

    claimGameOwnership(redis, gameId, self)
      .then(owner => {
        if (owner === self) return admit()
        // The client vanished during the claim round-trip: nothing to answer.
        if (!socket.writable) return
        // A non-101 response before the handshake: Fly's proxy sees the
        // header and replays the original upgrade request on the owner.
        socket.end(
          `HTTP/1.1 409 Conflict\r\nfly-replay: instance=${owner}\r\nconnection: close\r\ncontent-length: 0\r\n\r\n`
        )
      })
      .catch(admit)
  })
}
