import { hasGame } from '~~/types/events.types'
import type { ClientSideEventHandler } from '~~/lib/events/client-registry'
import { adoptRevision, isStaleSeat } from '~~/lib/events/client/snapshot-revision'

export const playerUpdateEvent: ClientSideEventHandler = async ({
  gameStore,
  payload,
  eventTarget,
}) => {
  if (!hasGame(payload)) return

  console.info(`Processing: ${payload.event}`)

  const { playerId } = eventTarget

  const { game } = payload
  if (!gameStore.game) {
    throw new ReferenceError('Game is not defined in player update event')
  }

  if (isStaleSeat(gameStore.game, game, playerId)) {
    return console.warn(`Dropped a seat update that would move ${playerId} backwards`)
  }
  gameStore.game.players[playerId] = game.players[playerId]
  adoptRevision(gameStore.game, game)
}
