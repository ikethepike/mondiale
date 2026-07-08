import { generateTiles } from '~~/lib/tiles'
import { defineGameHandler } from '../server-side'

export const updateConfigurationHandler = defineGameHandler(
  'update-configuration',
  async ({ game, server, eventData, eventTarget }) => {
    const { playerId } = eventTarget
    if (game.host !== playerId)
      return console.warn(`Non-host player tried to update configuration: ${playerId}`)
    // Regenerating tiles mid-game would invalidate every player's position
    if (game.started)
      return console.warn(`Configuration change rejected — game already started: ${game.id}`)

    const { configuration } = eventData

    game.difficulty = configuration.difficulty
    game.length = configuration.length
    game.variant = configuration.variant
    game.tiles = generateTiles(game.length)

    await server.updateGameState(game)
    // A dedicated event so clients replace the WHOLE game (config is
    // game-level) — the shared 'update' path only merges a single player and
    // would drop the config change for everyone but the host.
    server.emit({ event: 'configuration-updated', game }, eventTarget)
  },
  { player: 'optional' }
)
