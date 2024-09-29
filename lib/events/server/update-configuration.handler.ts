import { generateTiles } from '~~/lib/tiles'
import type { EventHandler } from '~~/server/middleware/socket.server'
import { useServerSideEvents } from '../server-side'

export const updateConfigurationHandler: EventHandler = async ({
  io,
  eventData,
  eventTarget,
  redis,
  socket,
}) => {
  if (eventData.event !== 'update-configuration') return

  const server = useServerSideEvents({ socket, redis, io })

  const { gameId, playerId } = eventTarget
  const game = await server.fetchGame(gameId)
  if (!game) throw new ReferenceError(`Unable to find game: ${gameId}`)
  if (game.host !== playerId)
    return console.warn(`Non-host player tried to update configuration: ${playerId}`)

  const { configuration } = eventData

  game.difficulty = configuration.difficulty
  game.length = configuration.length
  game.variant = configuration.variant
  game.tiles = generateTiles(game.length)

  await server.updateGameState(game)
  server.emit({ event: 'update', game }, eventTarget)
}
