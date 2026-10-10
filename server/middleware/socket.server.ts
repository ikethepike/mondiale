import { Redis } from '@upstash/redis'
import { Server } from 'socket.io'
import {
  enqueueGameTask,
  fetchSecrets,
  isDraining,
  useServerSideEvents,
  type GameServer,
  type GameSocket,
} from '~~/lib/events/server-side'
import { startOwnershipHeartbeat } from '~~/lib/events/server/game-ownership'
import { registerGameRouting } from '~~/lib/events/server/game-routing'
import { registerGracefulShutdown } from '~~/lib/events/server/graceful-shutdown'
import { verifyPlayerSecret } from '~~/lib/player-secret'
import { armAfkTakeover } from '~~/lib/events/server/bot-brain'
import { forgetCheerBucket } from '~~/lib/events/server/player-cheering.handler'
import { forgetGuessBucket } from '~~/lib/events/server/player-guessing.handler'
import { forgetTauntBucket } from '~~/lib/events/server/manhunt-taunt.handler'
import {
  SERVER_SIDE_EVENT_HANDLERS,
  UNQUEUED_CLIENT_EVENTS,
  UNRECORDED_CLIENT_EVENTS,
} from '~~/lib/events/server/registry'
import { recordSeatEvent, recordSeatRender } from '~~/lib/events/server/seat-journal'
import { startSeatAuditor } from '~~/lib/events/server/seat-auditor'
import '~~/lib/events/server/seat-cursor'

import type {
  ClientEvent,
  ClientEventAck,
  ClientEventData,
  ClientEventTarget,
} from '~~/types/events.types'

export type EventHandler = (configuration: {
  redis: Redis
  eventKey: ClientEvent
  eventData: ClientEventData
  eventTarget: ClientEventTarget
  socket: GameSocket
  io: GameServer
}) => void

/** Per-socket cap on 'error' log lines: the event is client-emittable, so a
 *  socket's share of the log has to be bounded. */
const SOCKET_ERROR_LOG_CAP = 3

/**
 * A watcher's socket dropped — remove them from the spectator set so the "N
 * watching" count and every broadcast snapshot stay honest. Players are NEVER
 * pruned: their records persist across disconnects on purpose (reconnect
 * healing rebuilds them). Runs on the per-game queue so it can't race a
 * concurrent handler's read-modify-write.
 */
const pruneSpectatorOnDisconnect = (io: GameServer, redis: Redis, socket: GameSocket) => {
  // The deploy drain disconnects EVERY socket at once — none of those are
  // watchers leaving, and the queue is refusing work anyway.
  if (isDraining()) return
  const { gameId, playerId } = socket.data
  if (!gameId || !playerId) return

  enqueueGameTask(gameId, async () => {
    const server = useServerSideEvents({ socket, redis, io })
    const game = await server.fetchGame(gameId)
    if (!game?.spectators?.[playerId]) return
    if (game.players[playerId]) return // a real player — never prune

    game.spectators = Object.fromEntries(
      Object.entries(game.spectators).filter(([id]) => id !== playerId)
    )
    await server.updateGameState(game)
    // eventTarget names the DEPARTED watcher — the actor whose exit this
    // snapshot reflects. Nothing keys off the target on whole-snapshot
    // broadcasts today; anything that starts to must tolerate a gone id.
    server.emit({ event: 'player-joined', game }, { gameId, playerId })
  }).catch(error => console.error(`Spectator prune failed for ${gameId}`, error))
}

let warnedMissingRedisToken = false

export default defineEventHandler(({ node }) => {
  const { REDIS_PASSWORD, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env
  const redisToken = UPSTASH_REDIS_REST_TOKEN ?? REDIS_PASSWORD
  if (!redisToken) {
    // PR previews may deploy without Redis secrets (see fly-preview.yml):
    // the site must still serve — /health especially, or Fly's health checks
    // can never pass — so skip the socket server instead of failing every
    // request. Multiplayer stays dark until a token is supplied.
    if (!warnedMissingRedisToken) {
      warnedMissingRedisToken = true
      console.warn(
        'No redis token supplied (UPSTASH_REDIS_REST_TOKEN or REDIS_PASSWORD) — socket server disabled'
      )
    }
    return
  }

  // Use globalThis for better cross-environment compatibility
  if (!globalThis.io) {
    const redis = new Redis({
      url: UPSTASH_REDIS_REST_URL ?? 'https://pure-ghost-24372.upstash.io',
      token: redisToken,
    })

    // Create a new Socket.IO server only if it doesn't already exist
    const httpServer = (node.res.socket as { server?: import('node:http').Server })?.server
    const io: GameServer = new Server(httpServer)

    // Transport-level failures (aborted handshakes, malformed requests,
    // abrupt client resets) surface on the ENGINE — the Server itself never
    // emits 'error'. The runtime's own trap keeps an unlistened emit from
    // being fatal, but it lands as a bare `[uncaughtException]` mid-dispatch;
    // this named seam turns it into a legible, greppable line instead.
    // The engine only exists once socket.io attached to a real http server;
    // prerender's mock requests carry none.
    if (io.engine) {
      io.engine.on('connection_error', (error: { code?: number; message: string }) => {
        console.warn(`engine connection_error ${error.code ?? ''}: ${error.message}`)
      })
    }

    // The multi-machine layer: shard rooms to their owning machine at the
    // front door, keep the leases warm, and hand rooms over cleanly when a
    // deploy retires this process. Routing and the heartbeat no-op without a
    // FLY_MACHINE_ID (single machine, local dev); the drain always applies —
    // it is what turns a deploy into a ~1s reconnect blip instead of a
    // frozen board.
    if (httpServer) registerGameRouting({ io, redis, httpServer })
    startOwnershipHeartbeat({ io, redis })
    startSeatAuditor({ io, redis })
    registerGracefulShutdown({ io, redis })
    // Optimistic bind for RECONNECTS: once a client has joined a room its
    // handshake carries { playerId, secret, gameId }, so verifying here
    // rebinds the socket as early as the secret lookup allows — narrowing the
    // reconnect gap that used to drop buffered events as unbound — WITHOUT
    // trusting an unproven id claim. The first connection (home page, no
    // gameId) skips this and lets the verified `join` handler do the binding.
    // NOT a guarantee: socket.io calls this listener synchronously and never
    // awaits it, so an event buffered behind the redis round-trip can still
    // land pre-bind and take the `unbound` ack — the client's retry is what
    // closes that window, and always was.
    const bindReconnectIdentity = async (socket: GameSocket) => {
      const { playerId, secret, gameId } = socket.handshake.auth ?? {}
      if (typeof playerId !== 'string' || !playerId) return
      if (typeof gameId !== 'string' || !gameId) return
      const secrets = await fetchSecrets(redis, gameId)
      const verdict = verifyPlayerSecret(
        secrets[playerId],
        typeof secret === 'string' ? secret : undefined
      )
      if (verdict === 'ok' || verdict === 'open') {
        socket.data.playerId = playerId
        socket.data.gameId = gameId
      }
    }

    // The listener stays SYNCHRONOUS: socket.io discards a returned promise,
    // so an async body is an unhandled-rejection trap for anything a future
    // edit awaits outside a try.
    io.on('connection', socket => {
      // Per-socket transport errors (reset mid-frame) AND socket.io's own
      // internal `_onerror` paths (invalid packet, middleware reject) land
      // here as a named line rather than a bare runtime-trapped throw.
      // 'error' is NOT a server-side reserved event, so a client can emit it
      // at will with any payload: log the message only (never the object),
      // and only the first few per socket, so neither a spoofing client nor
      // a flapping mobile connection can flood the log Fly pages on.
      let errorsLogged = 0
      socket.on('error', error => {
        if (errorsLogged++ >= SOCKET_ERROR_LOG_CAP) return
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`Socket ${socket.id} error: ${message.slice(0, 200)}`)
      })

      // Register event handlers synchronously FIRST, so nothing is missed
      // while the async handshake verification below runs.
      for (const [eventKey, configuration] of Object.entries(SERVER_SIDE_EVENT_HANDLERS)) {
        socket.on(
          eventKey,
          (
            eventData: ClientEventData,
            eventTarget: ClientEventTarget,
            ack?: (receipt: ClientEventAck) => void
          ) => {
            if (eventKey === 'time-sync') return ack?.({ ok: true, serverNow: Date.now() })
            console.log(`Received client event: ${eventKey} for ${eventTarget?.gameId}`)
            if (!eventTarget?.gameId) return

            // Deploy drain: this process is dying. No ack — silence makes the
            // client's retry land on the new machine after the reconnect,
            // where an 'error' receipt would make it give up for good.
            if (isDraining()) return

            // Authorization: the handshake (or `join`) establishes the
            // socket→player binding; every other event must target the SAME
            // player this socket claimed. This is the one chokepoint that
            // stops a client forging another player's actions
            // (server-originated re-entries call the handler functions
            // directly and never pass through here).
            // An UNBOUND socket (refused join left connected, pre-join
            // handshake) must match nothing: undefined !== undefined is
            // false, so without the explicit bind check a crafted
            // `playerId: undefined` target sailed through this guard.
            if (
              eventKey !== 'join' &&
              (!socket.data.playerId || eventTarget.playerId !== socket.data.playerId)
            ) {
              console.warn(
                `Rejected ${eventKey}: socket ${socket.data.playerId ?? '(unbound)'} tried to act as ${eventTarget.playerId}`
              )
              ack?.({ ok: false, reason: 'unbound', serverNow: Date.now() })
              return
            }

            const event = eventKey as ClientEvent
            if (eventData.event === 'seat-rendered') {
              recordSeatRender(redis, eventTarget.gameId, {
                viewer: eventTarget.playerId,
                seat: eventData.seatId,
                seq: eventData.seq,
                step: eventData.step,
                subject: eventData.subject,
                view: eventData.view,
                at: Date.now(),
              }).catch(error => console.error(`seat-rendered write failed`, error))
              return
            }
            if (UNQUEUED_CLIENT_EVENTS.includes(event)) return
            if (!UNRECORDED_CLIENT_EVENTS.includes(event)) {
              void recordSeatEvent(redis, eventTarget.gameId, {
                kind: 'event',
                at: Date.now(),
                actor: eventTarget.playerId,
                event,
                data: eventData,
              })
            }

            // Both branches consume the task promise — an unacked handler
            // throw must not surface as an unhandled rejection.
            enqueueGameTask(eventTarget.gameId, () =>
              configuration.handler({
                io,
                socket,
                redis,
                eventData,
                eventTarget,
                eventKey: event,
              })
            ).then(
              () => ack?.({ ok: true, serverNow: Date.now() }),
              error => {
                console.error(`Handler failed for ${eventKey} in ${eventTarget.gameId}`, error)
                ack?.({ ok: false, reason: 'error', serverNow: Date.now() })
              }
            )
          }
        )
      }

      socket.on('disconnect', () => {
        forgetGuessBucket(socket.id)
        forgetCheerBucket(socket.id)
        forgetTauntBucket(socket.id)
        pruneSpectatorOnDisconnect(io, redis, socket)
        // A seated player's exit mid-race arms the AFK takeover. The drain
        // guard is essential: a deploy disconnects EVERY socket at once, and
        // without it each deploy would hand the whole table to the autopilot.
        if (!isDraining() && socket.data.gameId && socket.data.playerId) {
          armAfkTakeover(
            {
              io,
              redis,
              socket,
              eventTarget: { gameId: socket.data.gameId, playerId: socket.data.playerId },
            },
            socket.id
          )
        }
      })

      bindReconnectIdentity(socket).catch(error => {
        console.error('Handshake secret check failed', error)
      })
    })

    globalThis.io = io // Persist the instance globally
  }
})

declare global {
  var io: Server | undefined
}
