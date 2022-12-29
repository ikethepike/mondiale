import { ClientSideEventHandler } from '~~/plugins/socket.client'

export const gameStartedHandler: ClientSideEventHandler = ({ gameStore, payload }) => {
  const { game } = payload
  gameStore.game = game
}
