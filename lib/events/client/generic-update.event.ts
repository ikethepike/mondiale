import { getEnvironmentData } from 'worker_threads'
import { wait } from '~~/lib/time'
import { ClientSideEventHandler } from '~~/plugins/socket.client'
import { useClientEvents } from '../client-side'

export const genericUpdateHandler: ClientSideEventHandler = async ({
  gameStore,
  payload,
  playerId,
  eventTarget,
}) => {
  const { game, event } = payload
  gameStore.game = game

  const { update } = useClientEvents()

  console.log('Handling server event:', event)

  switch (event) {
    case 'player-joined': {
      if (!game.started) {
        // gameStore.phase = game.players[playerId].name ? 'waiting-for-game' : 'naming'
        return
      }

      // gameStore.phase = !!gameStore.currentRound?.round.groupAnswers[playerId]
      //   ? 'moving'
      //   : 'group-challenge'
      return
    }
    case 'game-started':
      // gameStore.phase = 'tutorial'
      break
    case 'new-round':
      // gameStore.phase = 'group-challenge'
      break
    case 'group-challenge-scored':
      // if (eventTarget.playerId === playerId) {
      // gameStore.phase = 'scores'
      // }
      break
    case 'player-ready-for-round': {
      // if (playerId === eventTarget.playerId) {
      // gameStore.phase = 'waiting-for-round'
      // }
      break
    }
    case 'game-already-started':
      // gameStore.phase = 'kicked'
      break
    case 'individual-challenge-checked':
      break
  }
}
