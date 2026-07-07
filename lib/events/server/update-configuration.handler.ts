import { generateTiles } from '~~/lib/tiles'
import { defineGameHandler } from '../server-side'

export const updateConfigurationHandler = defineGameHandler(
  'update-configuration',
  async ({ game, server, eventData, eventTarget }) => {
    const { playerId } = eventTarget
    if (game.host !== playerId)
      return console.warn(`Non-host player tried to update configuration: ${playerId}`)

    const { configuration } = eventData

    game.difficulty = configuration.difficulty
    game.length = configuration.length
    game.variant = configuration.variant
    game.tiles = generateTiles(game.length)

    await server.updateGameState(game)
    server.emit({ event: 'update', game }, eventTarget)
  },
  { player: 'optional' }
)
