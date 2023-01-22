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
    gameStore.map.status = undefined
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

      if (!isValidClientEventTarget(eventTarget)) {
        throw new EvalError('Invalid client event target')
      }

      // Verify that key exists for index updates
      if (eventData.event === 'update-by-index') {
        let value: any = game.value
        for (const accessor of eventData.accessorPattern.split('.')) {
          if (!Reflect.has(value, accessor)) {
            console.warn(
              'Unable to send, invalid accessor',
              accessor,
              `from ${eventData.accessorPattern}`
            )
            return
          }

          value = value[accessor]
        }
      }

      socket.value.emit(eventData.event, eventData, eventTarget)
    },
  }
}
