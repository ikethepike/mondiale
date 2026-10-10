import { defineGameHandler } from '../server-side'
import { commitSeat, finalVerdict } from './seat-exits'

/**
 * A gauntlet answer. Accepted only on the seat's live question subject; the
 * verdict (lives, knockout, win) holds on that subject, and the next question
 * is only dealt onto the wire when the hold ends.
 */
export const submitFinalChallengeAnswerHandler = defineGameHandler(
  'submit-final-challenge-answer',
  async ({ game, player, server, eventData, eventTarget }) => {
    const { cursor } = player
    if (eventData.subject !== cursor.subject) {
      return server.emit({ event: 'update', game }, eventTarget)
    }
    // Same subject, already judged: the redelivered duplicate of this answer.
    if (cursor.step !== 'final') return

    const gauntlet = player.moves[0]?.challenge
    if (gauntlet?._type !== 'final-challenge') {
      return console.warn(`Final submit with no gauntlet at the head for ${player.id}`)
    }
    const question = gauntlet.challenges[0]
    if (!question) return console.warn(`Final challenge submitted with no questions left`)

    // An odd-one-out question offers a lineup, and only the lineup. Off it sit
    // countries that ALSO genuinely don't belong — a capped African Union
    // roster leaves 31 real members unlit — so scoring such a tap would burn a
    // life for a defensible answer.
    if (
      (question._type === 'membership-challenge' || question._type === 'treaty-challenge') &&
      'isoCode' in eventData.submittedAnswer &&
      !question.lineup.includes(eventData.submittedAnswer.isoCode)
    ) {
      return console.warn(`Answer outside the lineup — ignoring`)
    }

    // Deferred module: only loads once a game reaches the gauntlet (#110).
    const { isCorrectFinalAnswer } = await import('~~/lib/challenges/final-challenge')
    const correct = isCorrectFinalAnswer({
      challenge: question,
      submittedAnswer: eventData.submittedAnswer,
    })
    await finalVerdict(
      game,
      player,
      { correct, timedOut: false, submittedAnswer: eventData.submittedAnswer },
      'event:submit-final-challenge-answer'
    )
    await commitSeat(server, game, player)
  },
  { player: 'warn' }
)
