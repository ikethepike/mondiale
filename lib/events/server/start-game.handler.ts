import { getRoundChallenge } from '~~/lib/challenges'
import { defineGameHandler } from '../server-side'

export const startGameHandler = defineGameHandler(
  'start-game',
  async ({ game, server, eventTarget }) => {
    // Host-only: pre-start balcony watchers hold bound sockets, so this is
    // reachable by a non-player — the client guard alone no longer covers it.
    if (game.host !== eventTarget.playerId) {
      return console.warn(`Ignoring start-game from non-host ${eventTarget.playerId}`)
    }
    if (game.started) return server.emit({ event: 'update', game }, eventTarget)

    // Start the game
    game.started = true

    for (const playerId of Object.keys(game.players)) {
      game.players[playerId].phase = 'tutorial'
    }

    // Generate a new round
    game.rounds.push({
      groupChallenge: await getRoundChallenge({ game }),
      groupAnswers: {},
      playerTurns: {},
    })

    await server.updateGameState(game)
    server.emit({ event: 'game-started', game }, eventTarget)
  },
  { player: 'optional' }
)
