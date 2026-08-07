import { isCorrectIndividualAnswer } from '~~/lib/challenges'
import { latestRound } from '~~/lib/rounds'
import { gateLeapSteps, gatePot } from '~~/lib/scoring'
import { defineGameHandler } from '../server-side'
import { scheduleMovementPhase } from './enter-movement-phase.handler'
import { GATE_RESULT_HOLD_MS } from '~~/lib/round-beats'

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

    // Echo-token check (submit-chain-move's `turn` posture): an ack-redelivered
    // answer that lands after the walk already reached the NEXT gate must not
    // be judged against it.
    if (eventData.gateTile !== undefined && eventData.gateTile !== currentMove.endTile.position) {
      return console.warn(
        `Ignoring individual submit for gate ${eventData.gateTile} — head gate is ${currentMove.endTile.position}`
      )
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

    const correct = isCorrectIndividualAnswer(currentMove.challenge, eventData.isoCode)
    if (correct) {
      // Timed gates scale the leap by the clock; bought hints bite steps off.
      // The pot is the variant's, read through the shared `gatePot` so the
      // steps the client promised and the steps the server pays can't drift.
      player.currentPosition += gateLeapSteps(
        eventData.remainingFraction,
        eventData.hintsUsed,
        gatePot(currentMove.challenge.variant)
      )
      player.moves.shift()
    } else {
      // The block goes on the record before the moves are forfeited — without
      // it a blocked walk is indistinguishable from a clean one, on the board
      // and in the round history.
      const turn = latestRound(game)?.playerTurns[player.id]
      const lastMove = player.moves[player.moves.length - 1]
      if (turn && lastMove) {
        turn.blocked = {
          atTile: currentMove.endTile.position,
          forfeitedSteps: lastMove.endTile.position - player.currentPosition,
        }
      }
      player.moves = []
    }

    await server.updateGameState(game)
    server.emit({ event: 'individual-challenge-checked', game }, eventTarget)

    // Let the player bask in the result, then continue their movement.
    // The pause runs OUTSIDE the per-game queue — holding the lock for five
    // seconds would stall every other player's events — and the follow-up
    // re-enters through the queue with a fresh game fetch. It is the walk's
    // own resumption, so it travels as a continuation under the current walk
    // generation.
    scheduleMovementPhase(
      GATE_RESULT_HOLD_MS,
      { io, redis, socket, eventTarget },
      { continuation: true, walkSeq: player.walkSeq }
    )
  },
  { player: 'warn' }
)
