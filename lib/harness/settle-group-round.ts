import {
  ABSENT_SUBMISSION,
  gradeGroupAnswer,
  type GroupSubmission,
} from '~~/lib/events/server/grade-group-answer'
import { revealHoldMsFor } from '~~/lib/round-beats'
import type { Game, Round } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The preview harness's stand-in for the classic group-round settle.
 *
 * `/test-views` has no server, so a round used to end at the answer and every
 * scorecard needed its own hand-built scenario. This mirrors
 * `submit-group-challenge-answers.handler.ts` deliberately and minimally:
 * grade the table through the REAL scorer, bank answers and points onto the
 * round, hold for the kind's reveal beat, then flip the seats to
 * 'group-scores' so the harness's dispatcher lands on the scorecard.
 *
 * It is a stand-in, not a second engine: nothing here decides scoring, which
 * comes entirely from `gradeGroupAnswer`. It deliberately does NOT stamp moves
 * (`startWalk`): the harness runs no board, and the scorecard reads only the
 * round.
 */

/** How many of the answer set a rival finds, so the scorecard is not a wall of
 *  zeros. Seeded off the seat index — stable across a re-deal, never random. */
const RIVAL_SHARES = [0.6, 0.3]

/**
 * The one place the harness INVENTS data. Grading a rival as absent pays zero
 * by design, which makes every scorecard unreadable for the layout work this
 * harness exists for. Instead give each rival a partially-correct submission
 * sliced from the round's own correct set, and grade THAT through the same
 * scorer — so the points are real even though the answer is synthetic.
 */
const rivalSubmission = (correct: readonly ISOCountryCode[], seat: number): GroupSubmission => {
  const share = RIVAL_SHARES[seat % RIVAL_SHARES.length] ?? 0.5
  const take = Math.max(1, Math.round(correct.length * share))
  return { ranking: [...correct].slice(0, take) }
}

export const settleGroupRound = async ({
  game,
  round,
  submission,
  meId,
  onSettled,
}: {
  game: Game
  round: Round
  /** What the player actually answered, straight off the wire event. */
  submission: GroupSubmission
  meId: string
  /** Runs after the phases flip, so the harness can re-render. */
  onSettled?: () => void
}): Promise<void> => {
  // Once only: a redelivered submit must not re-score a settled round.
  if (round.groupAnswers[meId]) return

  const seats = Object.keys(game.players)

  const mine = await gradeGroupAnswer({ game, round, playerId: meId, submission })
  round.groupAnswers[meId] = mine.answer
  round.playerTurns[meId] = { points: mine.scoring }

  // The correct set the mode just graded against — the rivals' answers are
  // sliced from it, so they can never contain a country the round never had.
  const correct = mine.answer.correct ?? []

  let rivalSeat = 0
  for (const playerId of seats) {
    if (playerId === meId) continue
    // Play scenarios often deal only the pinned seat in (a ranking round's
    // `countriesPerPlayer`), and grading a seat the round never dealt to
    // throws. Fall back to the scorer's own absent path — the seat scores
    // zero, exactly as a real settle scores a player who never answered.
    let graded
    try {
      graded = await gradeGroupAnswer({
        game,
        round,
        playerId,
        submission: rivalSubmission(correct, rivalSeat++),
      })
    } catch {
      graded = await gradeGroupAnswer({
        game,
        round,
        playerId,
        submission: ABSENT_SUBMISSION,
        absent: true,
      })
    }
    round.groupAnswers[playerId] = graded.answer
    round.playerTurns[playerId] = { points: graded.scoring }
  }

  // Kinds with a reveal beat keep the seat in the challenge while the view
  // plays its display-only reveal; the flip is what ends the beat.
  const flip = () => {
    for (const playerId of seats) {
      const player = game.players[playerId]
      if (player) player.phase = 'group-scores'
    }
    onSettled?.()
  }

  const hold = revealHoldMsFor(round.groupChallenge)
  if (hold) setTimeout(flip, hold)
  else flip()
}
