import { ClientSideEventHandler } from '~~/plugins/socket.client'

export const playerJoinedEventHandler: ClientSideEventHandler = ({ payload, gameStore }) => {
  const { game } = payload
  gameStore.game = game
}
