import { getRoundChallenge } from '~~/lib/challenges'
import { defineGameHandler } from '../server-side'

export const startGameHandler = defineGameHandler(
  'start-game',
  async ({ game, server, eventTarget }) => {
    if (game.started) return server.emit({ event: 'update', game }, eventTarget)

    // Start the game
    game.started = true

    for (const playerId of Object.keys(game.players)) {
      game.players[playerId].phase = 'tutorial'
    }

    // Generate a new round
    game.rounds.push({
      groupChallenge: getRoundChallenge({ game }),
      groupAnswers: {},
      playerTurns: {},
    })

    await server.updateGameState(game)
    server.emit({ event: 'game-started', game }, eventTarget)
  },
  { player: 'optional' }
)
