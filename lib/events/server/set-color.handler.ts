import { PLAYER_COLORS } from '~~/data/palette'
import { shuffleArray } from '~~/lib/arrays'
import { defineGameHandler } from '../server-side'

export const setColorHandler = defineGameHandler(
  'set-color',
  async ({ game, player, server, eventTarget }) => {
    const playerColors = Object.values(game.players).flatMap(player => player.color)

    // Pick a unique, random color
    const colors = shuffleArray(
      PLAYER_COLORS.filter(color => {
        return !playerColors.includes(color)
      })
    )

    player.color = colors[0]
    await server.updateGameState(game)

    server.emit({ event: 'color-set', game }, eventTarget)
  }
)
