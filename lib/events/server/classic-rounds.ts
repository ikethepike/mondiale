import {
  CLASSIC_SETTLE_SLACK_MS,
  classicPlaySeconds,
  FIRST_TURN_GRACE_MS,
  isClassicGroupRound,
  revealHoldMsFor,
  ROUND_BOUND_PHASES,
  SERVER_CONTROLLED_CAPS,
  UNTIMED_CLASSIC_CAP_SECONDS,
} from '~~/lib/round-beats'
import { latestRound } from '~~/lib/rounds'
import type { Game, Round } from '~~/types/game.types'
import { ABSENT_SUBMISSION, gradeGroupAnswer } from './grade-group-answer'
import { advanceScoredSeat, scheduleEngineTask, type EngineContext } from './round-engine'
import { armGroupScoresCap } from './seat-exits'

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
  return seconds ? seconds * 1000 + FIRST_TURN_GRACE_MS : undefined
}

/** Stamp the play window onto the round being revealed — BEFORE the save, so
 *  the revealed snapshot carries a live clock every client repaints from. */
export const startClassicClock = (round: Round) => {
  if (!isClassicGroupRound(round.groupChallenge)) return
  const budget = classicBudgetMs(round)
  if (budget) round.deadline = Date.now() + budget
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
  const fireAt = round.deadline + revealHoldMsFor(round.groupChallenge) + CLASSIC_SETTLE_SLACK_MS
  scheduleEngineTask(ctx, Math.max(0, fireAt - Date.now()), async (fresh, server) => {
    if (fresh.rounds.length - 1 !== roundIndex) return
    const freshRound = latestRound(fresh)
    if (!freshRound || !isClassicGroupRound(freshRound.groupChallenge)) return

    const stragglers = Object.values(fresh.players).filter(seat =>
      ROUND_BOUND_PHASES.includes(seat.phase)
    )
    if (!stragglers.length) return

    for (const seat of stragglers) {
      const banked = freshRound.playerTurns[seat.id]?.points
      if (freshRound.groupAnswers[seat.id]) {
        // Answer banked but the phase advance was lost — the stranded-
        // submitter shape, healed here without waiting for a client retry.
        console.warn(`Classic settle advancing stranded seat ${seat.id} in ${fresh.id}`)
        await advanceScoredSeat(fresh, seat, banked?.scored ?? 0)
      } else {
        // Never answered: bank a zero through the SAME grading path a live
        // submit takes, so the scorecard still shows the round's answer. A
        // late genuine submit after this hits the groupAnswers latch and is
        // discarded — the zero stands.
        console.warn(`Classic settle banking absent seat ${seat.id} in ${fresh.id}`)
        const { scoring, answer } = await gradeGroupAnswer({
          round: freshRound,
          playerId: seat.id,
          submission: ABSENT_SUBMISSION,
          absent: true,
        })
        freshRound.groupAnswers[seat.id] = answer
        freshRound.playerTurns[seat.id] = { points: scoring }
        await advanceScoredSeat(fresh, seat, scoring.scored)
      }
    }

    await server.updateGameState(fresh)
    server.emit({ event: 'update', game: fresh }, ctx.eventTarget)
    // The advanced seats now owe the table a walk only a click normally
    // sends — cap each so a dead tab's scorecard can't freeze the room.
    for (const seat of stragglers) armGroupScoresCap(ctx, seat)
  })
}

/**
 * Round-1 seam: the natural first round never passes the reveal block in
 * enter-movement-phase (start-game stages it, tutorials gate it), so the
 * clock stamps on the FIRST tutorial close instead — the same re-entry the
 * turn engines use for their round-1 briefings. Only the first close stamps
 * (later closes see a live deadline); the caller saves.
 */
export const startClassicClockOnFirstClose = (game: Game): boolean => {
  const round = latestRound(game)
  if (!round || round.deadline || !isClassicGroupRound(round.groupChallenge)) return false
  startClassicClock(round)
  return !!round.deadline
}

/**
 * Re-arm the settle after a restart ate the timer. A stamped deadline is the
 * token that the round is live; a round staged-but-unrevealed (or a round-1
 * still behind every tutorial) has none and must not be armed — its clock
 * stamps at its own reveal moment. A pre-deploy round that revealed WITHOUT
 * a deadline regains one here (the chain-turns "re-stamp on rearm" pattern),
 * with its full budget so nobody is settled early.
 */
export const rearmClassicRound = (ctx: EngineContext, game: Game) => {
  const round = latestRound(game)
  if (!round || !isClassicGroupRound(round.groupChallenge)) return
  if (game.pendingRoundStart) return
  const inRound = Object.values(game.players).some(seat => seat.phase === 'group-challenge')
  if (!inRound) return
  if (!round.deadline) {
    const budget = classicBudgetMs(round)
    if (!budget) return
    round.deadline = Date.now() + budget
    scheduleEngineTask(ctx, 0, async (fresh, server) => {
      const freshRound = latestRound(fresh)
      if (!freshRound || freshRound.deadline || fresh.pendingRoundStart) return
      if (fresh.rounds.length !== game.rounds.length) return
      freshRound.deadline = round.deadline
      await server.updateGameState(fresh)
      server.emit({ event: 'update', game: fresh }, ctx.eventTarget)
    })
  }
  scheduleClassicSettle(ctx, game)
}
