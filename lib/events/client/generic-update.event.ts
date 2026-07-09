import { hasGame } from '~~/types/events.types'
import type { ClientSideEventHandler } from '~~/plugins/socket.client'

export const genericUpdateEvent: ClientSideEventHandler = async ({ gameStore, payload }) => {
  if (!hasGame(payload)) return

  const { game } = payload
  gameStore.game = game
}
