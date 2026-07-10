import { gateLeapSteps } from '~~/lib/scoring'
import { defineGameHandler, enqueueGameTask } from '../server-side'
import { enterMovementPhaseHandler } from './enter-movement-phase.handler'

export const submitIndividualChallengeAnswersHandler = defineGameHandler(
  'submit-individual-challenge-answer',
  async ({ game, player, server, eventData, eventTarget, io, redis, socket }) => {
    // Idempotency guard: only answer while genuinely blocked on this gate.
    // The player must be in the individual-challenge phase (set when the pawn
    // lands on the gate) AND the head move must still carry an individual
    // challenge.
    if (player.phase !== 'individual-challenge') {
      return console.warn(`Ignoring stale/duplicate individual submit (phase: ${player.phase})`)
    }

    const currentMove = player.moves[0]
    if (!currentMove || currentMove.challenge?._type !== 'individual-challenge') {
      return console.warn(`Unable to retrieve current individual challenge`)
    }

    // The `resolving` latch closes the duplicate window. On a correct answer
    // the whole move is shifted off, so the phase stays `individual-challenge`
    // across the 5s result beat while `moves[0]` is ALREADY the next move — a
    // bare move-level flag can't tell a replay of the answered gate from a
    // genuine answer to that next gate. The player-level latch is set here and
    // cleared only when the walk resumes (`enterMovementPhaseHandler`), which
    // is also the only path that reaches the next gate; a duplicate fired
    // during the pause is rejected. Stamp it BEFORE any await.
    if (player.resolving) {
      return console.warn(`Individual challenge already being processed — ignoring duplicate`)
    }
    player.resolving = true

    const correct = eventData.isoCode === currentMove.challenge.country
    if (correct) {
      // Timed gates scale the leap by the clock; bought hints bite steps off.
      player.currentPosition += gateLeapSteps(eventData.remainingFraction, eventData.hintsUsed)
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
