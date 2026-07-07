import { defineGameHandler, enqueueGameTask } from '../server-side'
import { enterMovementPhaseHandler } from './enter-movement-phase.handler'

export const submitIndividualChallengeAnswersHandler = defineGameHandler(
  'submit-individual-challenge-answer',
  async ({ game, player, server, eventData, eventTarget, io, redis, socket }) => {
    const currentMove = player.moves[0]
    if (!currentMove) {
      return console.warn(`Unable to retrieve current challenge`)
    }

    if (currentMove.challenge?._type === 'final-challenge') {
      return console.error(`Final challenge submitted as individual challenge`)
    }

    // Answer was correct
    if (eventData.isoCode === currentMove.challenge?.country) {
      player.currentPosition += 2
      player.moves.shift()
    } else {
      player.moves = []
    }

    await server.updateGameState(game)
    server.emit({ event: 'individual-challenge-checked', game }, eventTarget)

    // Let the player bask in the result, then continue their movement.
    // The pause runs OUTSIDE the per-game queue — holding the lock for five
    // seconds would stall every other player's events — and the follow-up
    // re-enters through the queue with a fresh game fetch.
    setTimeout(() => {
      enqueueGameTask(eventTarget.gameId, () =>
        enterMovementPhaseHandler({
          io,
          redis,
          socket,
          eventTarget,
          eventKey: 'enter-movement-phase',
          eventData: { event: 'enter-movement-phase' },
        })
      )
    }, 5000)
  },
  { player: 'warn' }
)
