import { io } from 'socket.io-client'
import { v4 as uuidv4 } from 'uuid'
import { genericUpdateEvent } from '~~/lib/events/client/generic-update.event'
import { indexUpdateEvent } from '~~/lib/events/client/index-update.event'
import { useGameStore } from '~~/store/game.store'
import { ClientEventTarget, ServerEventData } from '~~/types/events.types'

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
    handler: genericUpdateEvent,
  },
  'color-set': {
    handler: genericUpdateEvent,
  },
  'game-started': {
    handler: genericUpdateEvent,
  },
  'new-round': {
    handler: genericUpdateEvent,
  },
  'game-already-started': {
    handler: genericUpdateEvent,
  },
  update: {
    handler: genericUpdateEvent,
  },
  'group-challenge-scored': {
    handler: genericUpdateEvent,
  },
  'individual-challenge-checked': {
    handler: genericUpdateEvent,
  },
  'player-ready-for-round': {
    handler: genericUpdateEvent,
  },
  'index-update': {
    handler: indexUpdateEvent,
  },
}

const PLAYER_ID_STORAGE_KEY = `GL_PLAYER_ID`

export default defineNuxtPlugin(() => {
  const socket = io()
  const gameStore = useGameStore()
  gameStore.socket = socket
  const connected = ref(false)
  const playerId = ref(localStorage.getItem(PLAYER_ID_STORAGE_KEY) || uuidv4())

  // Set player ID
  localStorage.setItem(PLAYER_ID_STORAGE_KEY, playerId.value)

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
