import { defineGameHandler } from '../server-side'

export const closeTutorialHandler = defineGameHandler(
  'close-tutorial',
  async ({ game, player, server, eventTarget }) => {
    player.phase = 'group-challenge'

    await server.updateGameState(game)
    server.emit({ event: 'update', game }, eventTarget)
  }
)
