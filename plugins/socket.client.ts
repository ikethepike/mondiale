import { io } from 'socket.io-client'
import { v4 as uuidv4 } from 'uuid'
import { gameAlreadyStartedEvent } from '~~/lib/events/client/game-already-started.event'
import { genericUpdateEvent } from '~~/lib/events/client/generic-update.event'
import { groupChallengeScoredEvent } from '~~/lib/events/client/group-challenge-scored.event'
import { indexUpdateEvent } from '~~/lib/events/client/index-update.event'
import { playerCheeringEvent } from '~~/lib/events/client/player-cheering.event'
import { playerGuessingEvent } from '~~/lib/events/client/player-guessing.event'
import { playerUpdateEvent } from '~~/lib/events/client/player-update.event'
import { useGameStore } from '~~/store/game.store'
import type { ClientEventTarget, ServerEventData } from '~~/types/events.types'

export type ClientSideEventHandler = (data: {
  eventKey: ServerEventData['event']
  payload: ServerEventData
  gameStore: ReturnType<typeof useGameStore>
  eventTarget: ClientEventTarget
  playerId: string
}) => void

const CLIENT_SIDE_EVENT_HANDLERS: {
  [key in ServerEventData['event']]: {
    handler: ClientSideEventHandler
  }
} = {
  'player-joined': {
    handler: genericUpdateEvent,
  },
  'name-set': {
    handler: playerUpdateEvent,
  },
  'color-set': {
    handler: playerUpdateEvent,
  },
  'game-started': {
    handler: genericUpdateEvent,
  },
  'new-round': {
    handler: genericUpdateEvent,
  },
  'game-already-started': {
    handler: gameAlreadyStartedEvent,
  },
  update: {
    handler: playerUpdateEvent,
  },
  'configuration-updated': {
    handler: genericUpdateEvent,
  },
  'group-challenge-scored': {
    handler: groupChallengeScoredEvent,
  },
  // Whole-table state (turn cursor, eliminations, final scoring) — full replace
  'chain-updated': {
    handler: genericUpdateEvent,
  },
  'heritage-updated': {
    handler: genericUpdateEvent,
  },
  'individual-challenge-checked': {
    handler: playerUpdateEvent,
  },
  'index-update': {
    handler: indexUpdateEvent,
  },
  'final-challenge-checked': {
    handler: playerUpdateEvent,
  },
  'player-guessing': {
    handler: playerGuessingEvent,
  },
  'player-cheering': {
    handler: playerCheeringEvent,
  },
}

const PLAYER_ID_STORAGE_KEY = `GL_PLAYER_ID`
const PLAYER_SECRET_STORAGE_KEY = `GL_PLAYER_SECRET`

export default defineNuxtPlugin(() => {
  const playerId = ref(localStorage.getItem(PLAYER_ID_STORAGE_KEY) || uuidv4())

  // Set player ID
  localStorage.setItem(PLAYER_ID_STORAGE_KEY, playerId.value)

  // The private bearer token that proves this browser owns `playerId`. The id
  // is public (it rides every snapshot); the secret never does, so seeing an
  // id off the wire is not enough to act as its owner. Kept in localStorage
  // alongside the id and sent in the handshake auth, never in event payloads.
  const secret = localStorage.getItem(PLAYER_SECRET_STORAGE_KEY) || uuidv4()
  localStorage.setItem(PLAYER_SECRET_STORAGE_KEY, secret)

  // The handshake carries the id + secret so the server can VERIFY and rebind
  // the socket on every (re)connection. Verifying on the handshake (not only
  // in the join handler) closes the reconnect gap where buffered events flush
  // before the re-join lands — the classic post-deploy room freeze. gameId is
  // added to the auth by the room page so reconnects can be verified.
  const socket = io({ auth: { playerId: playerId.value, secret } })
  const gameStore = useGameStore()
  gameStore.socket = socket
  const connected = ref(false)

  gameStore.playerId = playerId.value

  socket.on('connect', () => {
    connected.value = socket.connected || false
  })

  socket.on('connect_error', err => {
    console.warn(`connect_error due to ${err.message}`)
  })

  socket.on('disconnect', () => {
    console.warn('Disconnected')
    connected.value = socket.connected || false
  })

  for (const [eventKey, configuration] of Object.entries(CLIENT_SIDE_EVENT_HANDLERS)) {
    console.log(`Setting up client listener for: ${eventKey}`)
    socket.on(eventKey, (payload, eventTarget) => {
      console.info(`Received client event: ${eventKey}`)

      return configuration.handler({
        eventKey: eventKey as ServerEventData['event'],
        payload,
        gameStore,
        eventTarget,
        playerId: playerId.value,
      })
    })
  }
})
