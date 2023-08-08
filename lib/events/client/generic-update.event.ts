import { ClientSideEventHandler } from '~~/plugins/socket.client'

export const genericUpdateEvent: ClientSideEventHandler = async ({ gameStore, payload }) => {
  if (payload.event === 'index-update') return

  const { game } = payload
  gameStore.game = game
}
