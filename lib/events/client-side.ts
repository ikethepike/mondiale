import { useGameStore } from '~~/store/game.store'
import { ClientEventData, isValidClientEventTarget } from '~~/types/events.types'
import { PlayerMove } from '~~/types/game.types'

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
    const playerPosition = game.value.position[playerId.value]
    if (!playerPosition) return []

    return playerPosition.moves
  })

  const currentMove = computed<PlayerMove | undefined>(() => {
    return currentMoves.value[0]
  })

  const player = computed(() => {
    if (!gameStore.game) return undefined
    return gameStore.game.players[playerId.value]
  })

  const isPlayerHost = computed<boolean>(() => {
    if (!player.value) return false
    return player.value.id === game.value?.host
  })

  return {
    _instance: socket,
    game,
    route,
    player,
    playerId,
    gameStore,
    currentMove,
    currentMoves,
    isPlayerHost,
    currentRound,
    update(eventData: ClientEventData) {
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

      if (!isValidClientEventTarget) {
        throw new EvalError('Invalid client event target')
      }

      socket.value.emit(eventData.event, eventData, eventTarget)
    },
  }
}
