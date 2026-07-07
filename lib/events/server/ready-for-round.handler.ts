import { getRoundChallenge } from '~~/lib/challenges'
import { defineGameHandler } from '../server-side'

export const readyForRoundHandler = defineGameHandler(
  'ready-for-round',
  async ({ game, player, server, eventTarget }) => {
    const lastMove = player.moves.shift()
    if (lastMove) {
      player.currentPosition += lastMove.steps
    }

    player.moves = []

    // Create a new round if there are no turns remaining
    if (Object.values(game.players).every(({ moves }) => moves.length === 0)) {
      game.rounds.push({
        groupChallenge: getRoundChallenge({ game }),
        groupAnswers: {},
        playerTurns: {},
      })

      await server.updateGameState(game)
      server.emit({ event: 'new-round', game }, eventTarget)
    } else {
      await server.updateGameState(game)
      server.emit({ event: 'player-ready-for-round', game }, eventTarget)
    }
  }
)
