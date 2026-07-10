import { Redis } from '@upstash/redis'
import { Server } from 'socket.io'
import { enqueueGameTask, type GameServer, type GameSocket } from '~~/lib/events/server-side'
import { closeTutorialHandler } from '~~/lib/events/server/close-tutorial.handler'
import { enterMovementPhaseHandler } from '~~/lib/events/server/enter-movement-phase.handler'
import { joinEventHandler } from '~~/lib/events/server/join.event'
import { setColorHandler } from '~~/lib/events/server/set-color.handler'
import { setNameHandler } from '~~/lib/events/server/set-name.handler'
import { startGameHandler } from '~~/lib/events/server/start-game.handler'
import { submitFinalChallengeAnswerHandler } from '~~/lib/events/server/submit-final-challenge-answer.handler'
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
}

export default defineEventHandler(({ node }) => {
  const { REDIS_PASSWORD, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env
  const redisToken = UPSTASH_REDIS_REST_TOKEN ?? REDIS_PASSWORD
  if (!redisToken) {
    throw new ReferenceError('No redis token supplied (UPSTASH_REDIS_REST_TOKEN or REDIS_PASSWORD)')
  }

  // Use globalThis for better cross-environment compatibility
  if (!globalThis.io) {
    const redis = new Redis({
      url: UPSTASH_REDIS_REST_URL ?? 'https://pure-ghost-24372.upstash.io',
      token: redisToken,
    })

    // Create a new Socket.IO server only if it doesn't already exist
    const io: GameServer = new Server(
      (node.res.socket as { server?: import('node:http').Server })?.server
    )
    io.on('connection', async socket => {
      // Bind the socket to the player id it presented at the handshake. The
      // playerId is a bearer token — the handshake claim grants nothing `join`
      // didn't. Binding here (not only in the join handler) closes the
      // reconnect gap where socket.io flushes buffered events before the
      // client's re-join lands, which used to silently drop them as unbound.
      const handshakePlayerId = socket.handshake.auth?.playerId
      if (typeof handshakePlayerId === 'string' && handshakePlayerId) {
        socket.data.playerId = handshakePlayerId
      }

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

            // Authorization: the handshake (or `join`) establishes the
            // socket→player binding; every other event must target the SAME
            // player this socket claimed. This is the one chokepoint that
            // stops a client forging another player's actions
            // (server-originated re-entries call the handler functions
            // directly and never pass through here).
            if (eventKey !== 'join' && eventTarget.playerId !== socket.data.playerId) {
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
      })
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
