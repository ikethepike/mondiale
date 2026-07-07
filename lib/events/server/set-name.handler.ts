import { defineGameHandler } from '../server-side'

export const setNameHandler = defineGameHandler(
  'set-name',
  async ({ game, player, server, eventData, eventTarget }) => {
    player.ready = true
    player.name = eventData.name
    player.phase = 'waiting-for-game'

    await server.updateGameState(game)

    server.emit({ event: 'name-set', game }, eventTarget)
  }
)
