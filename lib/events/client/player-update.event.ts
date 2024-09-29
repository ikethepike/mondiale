import type { ClientSideEventHandler } from '~~/plugins/socket.client'

export const playerUpdateEvent: ClientSideEventHandler = async ({
  gameStore,
  payload,
  eventTarget,
}) => {
  if (payload.event === 'index-update') return

  console.info(`Processing: ${payload.event}`)

  const { playerId } = eventTarget

  const { game } = payload
  if (!gameStore.game) {
    throw new ReferenceError('Game is not defined in player update event')
  }

  gameStore.game.players[playerId] = game.players[playerId]
}
