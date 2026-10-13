import { isCorrectIndividualAnswer } from '~~/lib/challenges'
import { gateRemainingFraction, gateVerdictLeadMs } from '~~/lib/gate-timing'
import { gateHintsOnSale, hintsBought } from '~~/lib/hints'
import { gradeGateSteps, isStepGraded } from '~~/lib/gate-steps'
import { gateResultHoldMsFor, isBrowsableGateVariant } from '~~/lib/round-beats'
import { gateLeapSteps, gatePot } from '~~/lib/scoring'
import { defineGameHandler } from '../server-side'
import { commitSeat, gateTimeout, gateVerdict } from './seat-exits'

/**
 * A gate answer. Accepted only on the seat's live gate subject; the verdict
 * holds on that subject, and the leap (or forfeit) is paid when the hold ends.
 */
export const submitIndividualChallengeAnswersHandler = defineGameHandler(
  'submit-individual-challenge-answer',
  async ({ game, player, server, eventData, eventTarget, receivedAt }) => {
    const { cursor } = player
    if (eventData.subject !== cursor.subject) {
      return server.emit({ event: 'update', game }, eventTarget)
    }
    // Same subject, already judged: the redelivered duplicate of this answer.
    if (cursor.step !== 'gate') return

    const gate = player.moves[0]
    if (gate?.challenge?._type !== 'individual-challenge') {
      return console.warn(`Gate submit with no gate at the head for ${player.id}`)
    }

    if ('timedOut' in eventData) {
      gateTimeout(game, player, 'event:submit-individual-challenge-answer')
      return commitSeat(server, game, player)
    }

    const { challenge } = gate
    const correct = isStepGraded(challenge)
      ? await gradeGateSteps(challenge, eventData.steps, game)
      : isCorrectIndividualAnswer(challenge, eventData.isoCode)
    // The clock and the hints bought are both the server's own record, so the
    // leap is priced here — the view shows the same fraction off the same deadline.
    const steps = correct
      ? gateLeapSteps(
          gateRemainingFraction(challenge, cursor.deadline, receivedAt),
          hintsBought(cursor, gateHintsOnSale(challenge.variant)),
          gatePot(challenge.variant)
        )
      : 0
    gateVerdict(
      game,
      player,
      { correct, timedOut: false, submitted: eventData.isoCode, steps },
      gateResultHoldMsFor(challenge.variant) + gateVerdictLeadMs(challenge),
      isBrowsableGateVariant(challenge.variant),
      'event:submit-individual-challenge-answer'
    )
    await commitSeat(server, game, player)
  },
  { player: 'warn' }
)
