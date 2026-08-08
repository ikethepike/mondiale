import { io } from 'socket.io-client'
import { joinRefusedEvent } from '~~/lib/events/client/join-refused.event'
import { genericUpdateEvent } from '~~/lib/events/client/generic-update.event'
import { groupChallengeScoredEvent } from '~~/lib/events/client/group-challenge-scored.event'
import { indexUpdateEvent } from '~~/lib/events/client/index-update.event'
import { manhuntPositionEvent } from '~~/lib/events/client/manhunt-position.event'
import { manhuntTauntEvent } from '~~/lib/events/client/manhunt-taunt.event'
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
    handler: joinRefusedEvent,
  },
  'room-full': {
    handler: joinRefusedEvent,
  },
  'removed-from-room': {
    handler: joinRefusedEvent,
  },
  update: {
    handler: playerUpdateEvent,
  },
  // Whole-table change with no mode event of its own — full replace, like
  // the engines' '*-updated' family below.
  'table-updated': {
    handler: genericUpdateEvent,
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
  'timeline-updated': {
    handler: genericUpdateEvent,
  },
  'manhunt-updated': {
    handler: genericUpdateEvent,
  },
  'unique-updated': {
    handler: genericUpdateEvent,
  },
  // Despot's eyes only — arrives on their socket alone, no game payload
  'manhunt-position': {
    handler: manhuntPositionEvent,
  },
  // Ephemeral taunt relay — no game payload
  'manhunt-taunt': {
    handler: manhuntTauntEvent,
  },
  // Seat + round slice: a gate verdict also writes the seat's
  // `playerTurns[].blocked` record, which the bare seat slice drops.
  'individual-challenge-checked': {
    handler: groupChallengeScoredEvent,
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
  const playerId = ref(localStorage.getItem(PLAYER_ID_STORAGE_KEY) || crypto.randomUUID())

  // Set player ID
  localStorage.setItem(PLAYER_ID_STORAGE_KEY, playerId.value)

  // The private bearer token that proves this browser owns `playerId`. The id
  // is public (it rides every snapshot); the secret never does, so seeing an
  // id off the wire is not enough to act as its owner. Kept in localStorage
  // alongside the id and sent in the handshake auth, never in event payloads.
  const secret = localStorage.getItem(PLAYER_SECRET_STORAGE_KEY) || crypto.randomUUID()
  localStorage.setItem(PLAYER_SECRET_STORAGE_KEY, secret)

  // The handshake carries the id + secret so the server can VERIFY and rebind
  // the socket on every (re)connection. Verifying on the handshake (not only
  // in the join handler) closes the reconnect gap where buffered events flush
  // before the re-join lands — the classic post-deploy room freeze. gameId is
  // added to the auth by the room page so reconnects can be verified.
  //
  // The room id ALSO rides the connection URL (manager `query`): that is what
  // the server's routing layer (game-routing.ts) reads to steer this socket to
  // the machine that owns the game BEFORE the connection opens. Websocket-only
  // makes that routing a single replayable request — the polling→websocket
  // upgrade dance would need sticky sessions instead. A direct room-page load
  // seeds the query here; useJoinRoom keeps it honest on navigation.
  const initialGameId = window.location.pathname.match(/^\/room\/([^/]+)/)?.[1]
  const socket = io({
    transports: ['websocket'],
    auth: { playerId: playerId.value, secret },
    ...(initialGameId ? { query: { gameId: initialGameId } } : {}),
  })
  const gameStore = useGameStore()
  gameStore.socket = socket

  gameStore.playerId = playerId.value

  socket.on('connect', () => {
    gameStore.disconnected = false
  })

  socket.on('connect_error', err => {
    console.warn(`connect_error due to ${err.message}`)
  })

  socket.on('disconnect', reason => {
    console.warn(`Disconnected (${reason})`)
    gameStore.disconnected = true
    // The deploy drain closes every socket server-side; socket.io reads that
    // as deliberate ('io server disconnect') and will NOT retry on its own.
    // Reconnect explicitly — by now the proxy routes to the new machine — or
    // every deploy would strand the whole room on a frozen board. NOT after a
    // terminal refusal (kick, closed door): those close the socket on purpose
    // and the refusal event lands before the disconnect, so `rejected` is
    // already set — reconnecting would park a zombie connection against the
    // proxy's hard limit for the life of the dead-end card.
    if (reason === 'io server disconnect' && !gameStore.rejected) socket.connect()
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
