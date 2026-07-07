import { getRoundChallenge } from '~~/lib/challenges'
import { wait } from '~~/lib/time'
import { defineGameHandler } from '../server-side'

export const enterMovementPhaseHandler = defineGameHandler(
  'enter-movement-phase',
  async ({ game, player, server, eventTarget }) => {
    // Defer movement logic to the server
    // Find all moves that we currently can do, move up player to the point and check tile
    const move = player.moves[0]
    if (move) {
      player.phase = 'moving'

      for (const index of [...Array(move.steps).keys()]) {
        const isLastStep = index + 1 === move.steps

        await wait(500)
        if (isLastStep && move.challenge) {
          player.phase = move.challenge._type
        } else if (isLastStep) {
          // player has no additional steps and the turn has not ended
          player.phase = 'movement-summary'
        } else {
          player.currentPosition++
        }
        server.emit({ event: 'update', game }, eventTarget)
      }
    } else {
      player.phase = 'movement-summary'
      await server.updateGameState(game)
      server.emit({ event: 'update', game }, eventTarget)
    }

    const readyForNextTurn = Object.values(game.players).every(
      player => player.phase === 'movement-summary'
    )

    if (readyForNextTurn) {
      game.rounds.push({
        groupChallenge: getRoundChallenge({ game }),
        groupAnswers: {},
        playerTurns: {},
      })

      await wait(2000)

      for (const playerId of Object.keys(game.players)) {
        game.players[playerId].phase = 'group-challenge'
      }

      await server.updateGameState(game)
      server.emit({ event: 'new-round', game }, eventTarget)
    } else {
      await server.updateGameState(game)
    }
  }
)
