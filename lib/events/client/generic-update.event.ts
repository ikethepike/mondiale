import { hasGame } from '~~/types/events.types'
import type { ClientSideEventHandler } from '~~/plugins/socket.client'

export const genericUpdateEvent: ClientSideEventHandler = async ({ gameStore, payload }) => {
  if (!hasGame(payload)) return

  // A previous manhunt's trail must never leak into a later round's view.
  if (payload.event === 'new-round') gameStore.manhunt = undefined

  const { game } = payload
  gameStore.game = game
}
