import { resolveAccessorPath } from '~~/lib/values'
import { useGameStore } from '~~/store/game.store'
import {
  type ClientEventAck,
  type ClientEventData,
  isCriticalClientEvent,
  isValidClientEventTarget,
} from '~~/types/events.types'
import type { PlayerMove } from '~~/types/game.types'

const ACK_TIMEOUT_MS = 5000
const ACK_ATTEMPTS = 3
const RETRY_BACKOFF_MS = 750

export const useClientEvents = () => {
  const router = useRouter()
  const gameStore = useGameStore()
  const game = toRef(gameStore, 'game')
  const route = toRef(router, 'currentRoute')
  const socket = toRef(gameStore, 'socket')
  const playerId = toRef(gameStore, 'playerId')
  const currentRound = toRef(gameStore, 'currentRound')

  const currentMoves = computed<PlayerMove[]>(() => {
    if (!game.value) return []
    if (!playerId.value) return []
    return game.value.players[playerId.value].moves
  })

  const currentMove = computed<PlayerMove | undefined>(() => {
    return currentMoves.value[0]
  })

  const player = computed(() => {
    if (!gameStore.game) return undefined
    return gameStore.game.players[playerId.value]
  })

  const hostPlayer = computed(() => {
    if (!gameStore.game) return undefined
    return Object.values(gameStore.game.players).find(player => player.id === game.value?.host)
  })

  const isPlayerHost = computed<boolean>(() => {
    if (!player.value) return false
    return player.value.id === game.value?.host
  })

  const currentFinalChallenge = computed(() => {
    if (currentMove.value?.challenge?._type !== 'final-challenge') return undefined
    return [...currentMove.value.challenge.challenges].shift()
  })

  const clearBoard = () => {
    gameStore.map.highlighted.clear()
    gameStore.map.reveal = undefined
    gameStore.map.revealStat = undefined
    gameStore.map.status = undefined
    gameStore.map.solo = false
    gameStore.map.labels = false
    gameStore.map.focus = []
    gameStore.map.focusContext = []
    gameStore.map.tints = {}
    gameStore.map.pin = undefined
    gameStore.map.pinAnswer = undefined
    gameStore.map.countryGroupings = undefined
    gameStore.map.seaLinks = []
    gameStore.map.staggered = false
    gameStore.map.dimmed = []
    gameStore.map.pulsing = []
    gameStore.map.atlasMode = false
    gameStore.map.zoomOut = undefined
    gameStore.map.feature = undefined
    gameStore.map.inset = undefined
    gameStore.map.liveGuesses = []
  }

  return {
    _instance: socket,
    game,
    route,
    player,
    playerId,
    gameStore,
    clearBoard,
    hostPlayer,
    currentMove,
    currentMoves,
    isPlayerHost,
    currentRound,
    currentFinalChallenge,
    async update(eventData: ClientEventData): Promise<boolean> {
      console.log('Sending event', eventData)
      if (!socket.value) {
        throw new EvalError(`Socket not initialized`)
      }

      const gameId = game.value?.id || route.value.params.roomId || ''
      if (!gameId) {
        throw ReferenceError('Game id not found')
      }

      if (!playerId.value) {
        throw ReferenceError('PlayerId not set')
      }

      const eventTarget = {
        gameId,
        playerId: playerId.value,
      }

      if (!isValidClientEventTarget(eventTarget)) {
        throw new EvalError('Invalid client event target')
      }

      // Verify that key exists for index updates
      if (eventData.event === 'update-by-index' && game.value) {
        const { found } = resolveAccessorPath(game.value, eventData.accessorPattern)
        if (!found) {
          console.warn('Unable to send, invalid accessor pattern', eventData.accessorPattern)
          return false
        }
      }

      if (!isCriticalClientEvent(eventData.event)) {
        socket.value.emit(eventData.event, eventData, eventTarget)
        return true
      }

      // Critical events advance the game's state machine — one lost in a
      // reconnect gap wedges the whole room. Send with an ack and retry until
      // the server confirms it ran; the handlers' duplicate guards make
      // retries safe.
      for (let attempt = 1; attempt <= ACK_ATTEMPTS; attempt++) {
        try {
          const receipt: ClientEventAck = await socket.value
            .timeout(ACK_TIMEOUT_MS)
            .emitWithAck(eventData.event, eventData, eventTarget)
          if (receipt.ok) return true

          // The socket lost its player binding (a reconnect raced the
          // re-join): join binds it back, and is idempotent server-side.
          if (receipt.reason === 'unbound' && game.value) {
            socket.value.emit('join', { event: 'join', variant: game.value.variant }, eventTarget)
          }
          console.warn(`${eventData.event} not accepted (${receipt.reason}), retrying`)
        } catch {
          console.warn(`No ack for ${eventData.event} (attempt ${attempt}/${ACK_ATTEMPTS})`)
        }

        if (attempt < ACK_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, RETRY_BACKOFF_MS * attempt))
        }
      }

      console.error(`Failed to deliver ${eventData.event} after ${ACK_ATTEMPTS} attempts`)
      return false
    },
  }
}
