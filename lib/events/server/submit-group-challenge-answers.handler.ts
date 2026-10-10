import { latestRound } from '~~/lib/rounds'
import { revealBudgetMsFor } from '~~/lib/round-beats'
import { defineGameHandler } from '../server-side'
import { gradeGroupAnswer } from './grade-group-answer'
import { advanceSeat } from './seat-cursor'
import { commitSeat, enterScores } from './seat-exits'

/**
 * A group-round answer, accepted only on the seat's live `round:N` subject:
 * banking it and moving the seat on happen in ONE save, so a banked answer
 * can never sit on a seat still shown the question.
 */
export const submitGroupChallengeAnswersHandler = defineGameHandler(
  'submit-group-challenge-answers',
  async ({ game, player, server, eventData, eventTarget }) => {
    const { playerId } = eventTarget
    const { cursor } = player
    if (eventData.subject !== cursor.subject) {
      return server.emit({ event: 'update', game }, eventTarget)
    }
    // Same subject, already banked: the redelivered duplicate of this answer.
    if (cursor.step !== 'round') return
    const currentRound = latestRound(game)
    if (!currentRound || currentRound.groupAnswers[playerId]) return

    const { scoring, answer } = await gradeGroupAnswer({
      game,
      round: currentRound,
      playerId,
      submission: eventData,
    })
    currentRound.groupAnswers[playerId] = answer
    currentRound.playerTurns[playerId] = { points: scoring }

    // Test hook: FORCE_FINAL_CHALLENGE=1 teleports every player next to the
    // final tile after this round, so its gauntlet starts within seconds
    if (typeof process !== 'undefined' && process.env?.FORCE_FINAL_CHALLENGE === '1') {
      const finalTile = game.tiles[game.tiles.length - 1]
      player.currentPosition = finalTile.position - 1
      const { getFinalChallenges } = await import('~~/lib/challenges/final-challenge')
      await enterScores(game, player, scoring.scored, 'event:submit-group-challenge-answers', {
        moves: [{ endTile: finalTile, challenge: getFinalChallenges({ game }) }],
      })
      return commitSeat(server, game, player)
    }

    // Kinds with a reveal beat hold the seat on its verdict while the view
    // plays the reveal (or the player browses it, up to the cap); the hold's
    // end moves it to the scorecard.
    const hold = revealBudgetMsFor(currentRound.groupChallenge)
    if (hold) {
      advanceSeat(
        game,
        player,
        {
          step: 'round-verdict',
          subject: cursor.subject,
          holdUntil: Date.now() + hold,
          verdict: {
            kind: 'round',
            subject: cursor.subject,
            scored: scoring.scored,
            maximum: scoring.maximum,
          },
        },
        'event:submit-group-challenge-answers'
      )
    } else {
      await enterScores(game, player, scoring.scored, 'event:submit-group-challenge-answers')
    }
    await commitSeat(server, game, player)
  }
)
