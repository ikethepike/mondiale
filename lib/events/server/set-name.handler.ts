import { normalizePlayerName } from '~~/lib/player'
import { defineGameHandler } from '../server-side'

export const setNameHandler = defineGameHandler(
  'set-name',
  async ({ game, player, server, eventData, eventTarget }) => {
    // A blank name never readies a player — the client blocks it too, but the
    // socket payload can't be trusted to have gone through the form.
    const name = normalizePlayerName(eventData.name)
    if (!name) {
      return console.warn(`Rejected blank name for player: ${eventTarget.playerId}`)
    }
    // Names are a lobby edit: a redelivered set-name after the start must
    // never touch a seat that is racing.
    if (player.cursor.step !== 'lobby') {
      return console.warn(`Ignoring set-name outside the lobby for ${eventTarget.playerId}`)
    }

    player.ready = true
    player.name = name

    await server.updateGameState(game)

    server.emit({ event: 'name-set', game }, eventTarget)
  }
)
