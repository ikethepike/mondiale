import {
  ABSENT_SUBMISSION,
  gradeGroupAnswer,
  type GroupSubmission,
} from '~~/lib/events/server/grade-group-answer'
import { GROUP_SCORES_CAP_MS, revealBudgetMsFor, SERVER_CONTROLLED_CAPS } from '~~/lib/round-beats'
import { applySeatMove, ROUND_SETTLE_STEPS, seatSubject } from '~~/lib/seat-transitions'
import type { Game, Round } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The preview harness's stand-in for the classic group-round settle.
 *
 * `/test-views` has no server, so a round used to end at the answer and every
 * scorecard needed its own hand-built scenario. This mirrors
 * `submit-group-challenge-answers.handler.ts` deliberately and minimally:
 * grade the table through the REAL scorer, bank answers and points onto the
 * round, hold the player on their verdict for the kind's reveal beat, then
 * move every seat to its scorecard through the same transition table the
 * server validates against.
 *
 * It is a stand-in, not a second engine: nothing here decides scoring, which
 * comes entirely from `gradeGroupAnswer`. It deliberately deals no moves: the
 * harness runs no board, and the scorecard reads only the round.
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
  /** Runs after the seats reach their scorecards, so the harness can re-render. */
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

  const roundIndex = game.rounds.indexOf(round)
  const toScores = (playerId: string, cause: string) => {
    const player = game.players[playerId]
    if (!player || !ROUND_SETTLE_STEPS.includes(player.cursor.step)) return
    applySeatMove(
      player,
      {
        step: 'scores',
        subject: seatSubject.scores(roundIndex),
        deadline: SERVER_CONTROLLED_CAPS ? Date.now() + GROUP_SCORES_CAP_MS : undefined,
        walk: player.cursor.walk + 1,
        leg: 0,
      },
      cause
    )
  }
  for (const playerId of seats) {
    if (playerId !== meId) toScores(playerId, 'table:settle')
  }

  // Kinds with a reveal beat hold the player on their verdict while the view
  // plays its reveal; the hold's end is what moves them on.
  const hold = revealBudgetMsFor(round.groupChallenge)
  const me = game.players[meId]
  if (!hold || me?.cursor.step !== 'round') {
    toScores(meId, 'event:submit-group-challenge-answers')
    onSettled?.()
    return
  }
  const subject = me.cursor.subject
  applySeatMove(
    me,
    {
      step: 'round-verdict',
      subject,
      holdUntil: Date.now() + hold,
      verdict: {
        kind: 'round',
        subject,
        scored: mine.scoring.scored,
        maximum: mine.scoring.maximum,
      },
    },
    'event:submit-group-challenge-answers'
  )
  setTimeout(() => {
    toScores(meId, 'timer:verdict-hold')
    onSettled?.()
  }, hold)
}
