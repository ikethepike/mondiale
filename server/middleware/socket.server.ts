import { Redis } from '@upstash/redis'
import { Server } from 'socket.io'
import {
  enqueueGameTask,
  fetchSecrets,
  isDraining,
  RetryableReject,
  useServerSideEvents,
  type GameServer,
  type GameSocket,
} from '~~/lib/events/server-side'
import { startOwnershipHeartbeat } from '~~/lib/events/server/game-ownership'
import { registerGameRouting } from '~~/lib/events/server/game-routing'
import { registerGracefulShutdown } from '~~/lib/events/server/graceful-shutdown'
import { verifyPlayerSecret } from '~~/lib/player-secret'
import { closeTutorialHandler } from '~~/lib/events/server/close-tutorial.handler'
import { enterMovementPhaseHandler } from '~~/lib/events/server/enter-movement-phase.handler'
import { joinEventHandler } from '~~/lib/events/server/join.event'
import { setColorHandler } from '~~/lib/events/server/set-color.handler'
import { setNameHandler } from '~~/lib/events/server/set-name.handler'
import { startGameHandler } from '~~/lib/events/server/start-game.handler'
import { submitFinalChallengeAnswerHandler } from '~~/lib/events/server/submit-final-challenge-answer.handler'
import { submitChainMoveHandler } from '~~/lib/events/server/submit-chain-move.handler'
import { submitManhuntMoveHandler } from '~~/lib/events/server/submit-manhunt-move.handler'
import { submitManhuntMarkerHandler } from '~~/lib/events/server/submit-manhunt-marker.handler'
import { submitManhuntSubpoenaHandler } from '~~/lib/events/server/submit-manhunt-subpoena.handler'
import { fetchManhuntPositionHandler } from '~~/lib/events/server/fetch-manhunt-position.handler'
import { manhuntReadyHandler } from '~~/lib/events/server/manhunt-ready.handler'
import { uniqueReadyHandler } from '~~/lib/events/server/unique-ready.handler'
import { chainReadyHandler } from '~~/lib/events/server/chain-ready.handler'
import { submitUniqueAnswerHandler } from '~~/lib/events/server/submit-unique-answer.handler'
import { sweepReadyHandler } from '~~/lib/events/server/sweep-ready.handler'
import { submitSweepClaimHandler } from '~~/lib/events/server/submit-sweep-claim.handler'
import { forgetTauntBucket, manhuntTauntHandler } from '~~/lib/events/server/manhunt-taunt.handler'
import { submitHeritagePinHandler } from '~~/lib/events/server/submit-heritage-pin.handler'
import { submitTimelinePlacementHandler } from '~~/lib/events/server/submit-timeline-placement.handler'
import { submitGroupChallengeAnswersHandler } from '~~/lib/events/server/submit-group-challenge-answers.handler'
import { submitIndividualChallengeAnswersHandler } from '~~/lib/events/server/submit-individual-challenge-answer.handler'
import { updateByIndexHandler } from '~~/lib/events/server/update-by-index.handler'
import {
  forgetCheerBucket,
  playerCheeringHandler,
} from '~~/lib/events/server/player-cheering.handler'
import {
  forgetGuessBucket,
  playerGuessingHandler,
} from '~~/lib/events/server/player-guessing.handler'
import { kickPlayerHandler } from '~~/lib/events/server/kick-player.handler'
import { setSpectatorAccessHandler } from '~~/lib/events/server/set-spectator-access.handler'
import { updateConfigurationHandler } from '~~/lib/events/server/update-configuration.handler'

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

const SERVER_SIDE_EVENT_HANDLERS: {
  [clientEvent in ClientEvent]: {
    handler: EventHandler
  }
} = {
  join: {
    handler: joinEventHandler,
  },
  'set-name': {
    handler: setNameHandler,
  },
  'set-color': {
    handler: setColorHandler,
  },
  'start-game': {
    handler: startGameHandler,
  },
  'submit-individual-challenge-answer': {
    handler: submitIndividualChallengeAnswersHandler,
  },
  'submit-group-challenge-answers': {
    handler: submitGroupChallengeAnswersHandler,
  },
  'submit-chain-move': {
    handler: submitChainMoveHandler,
  },
  'submit-heritage-pin': {
    handler: submitHeritagePinHandler,
  },
  'submit-manhunt-move': {
    handler: submitManhuntMoveHandler,
  },
  'submit-manhunt-marker': {
    handler: submitManhuntMarkerHandler,
  },
  'submit-manhunt-subpoena': {
    handler: submitManhuntSubpoenaHandler,
  },
  'manhunt-ready': {
    handler: manhuntReadyHandler,
  },
  'unique-ready': {
    handler: uniqueReadyHandler,
  },
  'chain-ready': {
    handler: chainReadyHandler,
  },
  'submit-unique-answer': {
    handler: submitUniqueAnswerHandler,
  },
  'sweep-ready': {
    handler: sweepReadyHandler,
  },
  'submit-sweep-claim': {
    handler: submitSweepClaimHandler,
  },
  // Ephemeral taunt relay — no permanent state written
  'manhunt-taunt': {
    handler: manhuntTauntHandler,
  },
  // Reads only the requesting despot's own secret; answers on their socket
  'fetch-manhunt-position': {
    handler: fetchManhuntPositionHandler,
  },
  'submit-timeline-placement': {
    handler: submitTimelinePlacementHandler,
  },
  'close-tutorial': {
    handler: closeTutorialHandler,
  },
  'enter-movement-phase': {
    handler: enterMovementPhaseHandler,
  },
  // Does not write to permanent game state
  'update-by-index': {
    handler: updateByIndexHandler,
  },
  // Ephemeral live guess relay (group rounds) — no permanent state written
  'player-guessing': {
    handler: playerGuessingHandler,
  },
  // Ephemeral emoji cheer relay — no permanent state written
  'player-cheering': {
    handler: playerCheeringHandler,
  },
  'submit-final-challenge-answer': {
    handler: submitFinalChallengeAnswerHandler,
  },
  'update-configuration': {
    handler: updateConfigurationHandler,
  },
  'set-spectator-access': {
    handler: setSpectatorAccessHandler,
  },
  'kick-player': {
    handler: kickPlayerHandler,
  },
}

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

    // The multi-machine layer: shard rooms to their owning machine at the
    // front door, keep the leases warm, and hand rooms over cleanly when a
    // deploy retires this process. Routing and the heartbeat no-op without a
    // FLY_MACHINE_ID (single machine, local dev); the drain always applies —
    // it is what turns a deploy into a ~1s reconnect blip instead of a
    // frozen board.
    if (httpServer) registerGameRouting({ io, redis, httpServer })
    startOwnershipHeartbeat({ io, redis })
    registerGracefulShutdown({ io, redis })
    io.on('connection', async socket => {
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
              ack?.({ ok: false, reason: 'unbound' })
              return
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
                eventKey: eventKey as ClientEvent,
              })
            ).then(
              () => ack?.({ ok: true }),
              error => {
                // A transient rejection (a `resolving` latch mid-hold) is the
                // client's cue to RETRY the same payload — never ack it ok,
                // or the answer dies with a success receipt.
                if (error instanceof RetryableReject) {
                  console.warn(`${eventKey} deferred (${error.message}) in ${eventTarget.gameId}`)
                  ack?.({ ok: false, reason: 'resolving' })
                  return
                }
                console.error(`Handler failed for ${eventKey} in ${eventTarget.gameId}`, error)
                ack?.({ ok: false, reason: 'error' })
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
      })

      // Optimistic bind for RECONNECTS: once a client has joined a room its
      // handshake carries { playerId, secret, gameId }, so verifying here
      // rebinds the socket before its buffered events flush — closing the
      // reconnect gap that used to drop them as unbound — WITHOUT trusting an
      // unproven id claim. The first connection (home page, no gameId) skips
      // this and lets the verified `join` handler do the binding.
      const { playerId, secret, gameId } = socket.handshake.auth ?? {}
      if (typeof playerId === 'string' && playerId && typeof gameId === 'string' && gameId) {
        try {
          const secrets = await fetchSecrets(redis, gameId)
          const verdict = verifyPlayerSecret(
            secrets[playerId],
            typeof secret === 'string' ? secret : undefined
          )
          if (verdict === 'ok' || verdict === 'open') {
            socket.data.playerId = playerId
            socket.data.gameId = gameId
          }
        } catch (error) {
          console.error('Handshake secret check failed', error)
        }
      }
    })

    io.on('error', error => {
      console.error('Error in socket server', error)
    })

    io.on('connect_error', err => {
      console.error(`connect_error due to ${err.message}`)
    })

    globalThis.io = io // Persist the instance globally
  }
})

declare global {
  var io: Server | undefined
}
