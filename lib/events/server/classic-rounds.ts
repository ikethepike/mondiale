import {
  briefingHolds,
  CLASSIC_SETTLE_SLACK_MS,
  classicPlaySeconds,
  FIRST_TURN_GRACE_MS,
  isClassicGroupRound,
  playGateMsFor,
  revealBudgetMsFor,
  SERVER_CONTROLLED_CAPS,
  UNTIMED_CLASSIC_CAP_SECONDS,
} from '~~/lib/round-beats'
import { latestRound } from '~~/lib/rounds'
import { ROUND_SETTLE_STEPS } from '~~/lib/seat-transitions'
import type { Game, Round } from '~~/types/game.types'
import { ABSENT_SUBMISSION, gradeGroupAnswer } from './grade-group-answer'
import { scheduleEngineTask, settleRoundScores, type EngineContext } from './round-engine'

/**
 * The generic server clock for every classic group round — the ~24 modes
 * whose play window used to live ONLY in a client interval, where one
 * throttled tab froze the whole table. The reveal stamps `round.deadline`
 * (an absolute epoch, like the turn engines' `state.deadline`); the settle
 * task force-banks whoever never answered once the deadline, the kind's
 * reveal hold and a slack have all passed — late enough that every live
 * client's own submit wins the race. Beats and holds come from ROUND_BEATS;
 * this engine never carries a number of its own.
 */

/** The classic clock's full budget in ms, or undefined when the kind is
 *  untimed and the caps are off (no server clock — by explicit choice). */
const classicBudgetMs = (round: Round): number | undefined => {
  const seconds =
    classicPlaySeconds(round.groupChallenge) ??
    (SERVER_CONTROLLED_CAPS ? UNTIMED_CLASSIC_CAP_SECONDS : undefined)
  if (!seconds) return undefined
  // A play-gated kind's window opens on a LOCAL tap, so the stamp has to
  // cover the wait as well as the play. Widening here rather than at the
  // stamp site means every caller inherits it — the reveal, the round-1
  // tutorial close, and the rejoin re-stamp alike.
  return seconds * 1000 + playGateMsFor(round.groupChallenge) + FIRST_TURN_GRACE_MS
}

/** Stamp the play window onto the round being revealed — BEFORE the save, so
 *  the revealed snapshot carries a live clock every client repaints from.
 *  On a play-gated kind (the audio rounds) this is a BACKSTOP CEILING, not
 *  the on-screen clock: the player's countdown starts at their play tap and
 *  runs `durationSeconds`, while this covers that wait plus the play. */
export const startClassicClock = (round: Round) => {
  if (!isClassicGroupRound(round.groupChallenge)) return
  // A classic kind behind a briefing (Terra Incognita) stamps on the last
  // ready or the cap — its own beats file owns that moment.
  if (briefingHolds(round.groupChallenge)) return
  stampClassicClock(round, Date.now())
}

/** The one stamp of a classic round's clock: its play start and its close. */
const stampClassicClock = (round: Round, now: number) => {
  const budget = classicBudgetMs(round)
  if (!budget) return
  round.playStartsAt = now + FIRST_TURN_GRACE_MS
  round.deadline = now + budget
}

/**
 * Arm the round's settle backstop. Fires behind `deadline + revealHold +
 * slack`; the fresh fetch plus the round-index token (the unique-beats
 * pattern — classic rounds are single-beat) make double-arming safe, and a
 * round where every seat already advanced settles nothing.
 */
export const scheduleClassicSettle = (ctx: EngineContext, game: Game) => {
  const round = latestRound(game)
  if (!round?.deadline || !isClassicGroupRound(round.groupChallenge)) return
  const roundIndex = game.rounds.length - 1
  const fireAt = round.deadline + revealBudgetMsFor(round.groupChallenge) + CLASSIC_SETTLE_SLACK_MS
  scheduleEngineTask(ctx, Math.max(0, fireAt - Date.now()), async (fresh, server) => {
    if (fresh.rounds.length - 1 !== roundIndex) return
    const freshRound = latestRound(fresh)
    if (!freshRound || !isClassicGroupRound(freshRound.groupChallenge)) return

    const stragglers = Object.values(fresh.players).filter(seat =>
      ROUND_SETTLE_STEPS.includes(seat.cursor.step)
    )
    if (!stragglers.length) return

    // Grade whoever never answered through the SAME path a live submit
    // takes, then bank + advance the whole cohort through the one settlement
    // ritual. A seat mid-verdict keeps its banked answer and score; an
    // absentee's later submit lands on a spent subject and is discarded —
    // the zero stands.
    const scores: { [playerId: string]: { scored: number; maximum: number } } = {}
    for (const seat of stragglers) {
      const banked = freshRound.playerTurns[seat.id]?.points
      if (freshRound.groupAnswers[seat.id]) {
        scores[seat.id] = banked ?? { scored: 0, maximum: 0 }
      } else {
        console.warn(`Classic settle banking absent seat ${seat.id} in ${fresh.id}`)
        const { scoring, answer } = await gradeGroupAnswer({
          game: fresh,
          round: freshRound,
          playerId: seat.id,
          submission: ABSENT_SUBMISSION,
          absent: true,
        })
        freshRound.groupAnswers[seat.id] = answer
        scores[seat.id] = scoring
      }
    }
    await settleRoundScores({
      game: fresh,
      round: freshRound,
      order: stragglers.map(seat => seat.id),
      scores,
      maximumPoints: 0,
      answerFor: playerId => freshRound.groupAnswers[playerId] ?? { submitted: [], correct: [] },
    })

    await server.updateGameState(fresh)
    // Whole-table change → whole-snapshot event. 'update' is a SEAT slice
    // client-side; riding it here would flip one arbitrary seat and leave
    // every other straggler visually frozen on the challenge.
    server.emit({ event: 'table-updated', game: fresh }, ctx.eventTarget)
  })
}

/**
 * Round-1 seam: the natural first round never passes the round reveal
 * (start-game deals it, tutorials gate it), so the
 * clock stamps on the tutorial close that empties the rules cards — the same
 * re-entry the turn engines use for their round-1 briefings. Not the FIRST
 * close: a clock started under a slower reader's card could settle the round
 * before their tutorial cap even fires, zero-banking a live seat. The
 * tutorial caps bound how long the stamp can wait; the caller saves.
 */
export const startClassicClockOnLastClose = (game: Game): boolean => {
  const round = latestRound(game)
  if (!round || round.deadline || !isClassicGroupRound(round.groupChallenge)) return false
  const stillReading = Object.values(game.players).some(seat => seat.cursor.step === 'tutorial')
  if (stillReading) return false
  startClassicClock(round)
  return !!round.deadline
}

/**
 * Re-arm the settle after a restart ate the timer. A stamped deadline is the
 * token that the round is live; a round-1 still behind every tutorial has
 * none and must not be armed — its clock stamps on the last close. A pre-deploy round that revealed WITHOUT
 * a deadline regains one here (the chain-turns "re-stamp on rearm" pattern),
 * with its full budget so nobody is settled early.
 */
export const rearmClassicRound = (ctx: EngineContext, game: Game) => {
  const round = latestRound(game)
  if (!round || !isClassicGroupRound(round.groupChallenge)) return
  const inRound = Object.values(game.players).some(seat =>
    ['round', 'round-verdict'].includes(seat.cursor.step)
  )
  if (!inRound) return
  if (!round.deadline) {
    // Behind its briefing there is nothing to revive here: the cap is the
    // mode's own rearm, and a stamp now would start the world under the card.
    if (briefingHolds(round.groupChallenge)) return
    stampClassicClock(round, Date.now())
    if (!round.deadline) return
    scheduleEngineTask(ctx, 0, async (fresh, server) => {
      const freshRound = latestRound(fresh)
      if (!freshRound || freshRound.deadline) return
      if (fresh.rounds.length !== game.rounds.length) return
      freshRound.deadline = round.deadline
      freshRound.playStartsAt = round.playStartsAt
      await server.updateGameState(fresh)
      // Round-level stamp → whole-snapshot event (a seat slice drops it).
      server.emit({ event: 'table-updated', game: fresh }, ctx.eventTarget)
    })
  }
  scheduleClassicSettle(ctx, game)
}
