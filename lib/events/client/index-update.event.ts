import { setByAccessorPath } from '~~/lib/values'
import type { ClientSideEventHandler } from '~~/plugins/socket.client'

export const indexUpdateEvent: ClientSideEventHandler = async ({ gameStore, payload }) => {
  if (payload.event !== 'index-update') return
  const { game } = gameStore
  if (!game) {
    throw new ReferenceError('Game is not defined in index update event')
  }

  const { accessorPattern } = payload
  if (!setByAccessorPath(game, accessorPattern, payload.value)) {
    console.error('Invalid accessor pattern passed', accessorPattern)
  }
}
