import {
  CLASSIC_SETTLE_SLACK_MS,
  classicPlaySeconds,
  FIRST_TURN_GRACE_MS,
  isClassicGroupRound,
  playGateMsFor,
  revealBudgetMsFor,
  revealHoldMsFor,
  ROUND_SETTLE_PHASES,
  SERVER_CONTROLLED_CAPS,
  UNTIMED_CLASSIC_CAP_SECONDS,
} from '~~/lib/round-beats'
import { latestRound } from '~~/lib/rounds'
import type { Game, Round } from '~~/types/game.types'
import { ABSENT_SUBMISSION, gradeGroupAnswer } from './grade-group-answer'
import {
  advanceScoredSeat,
  scheduleEngineTask,
  settleRoundScores,
  type EngineContext,
} from './round-engine'
import { armGroupScoresCap, armGroupScoresCaps } from './seat-exits'

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
  const fireAt = round.deadline + revealBudgetMsFor(round.groupChallenge) + CLASSIC_SETTLE_SLACK_MS
  scheduleEngineTask(ctx, Math.max(0, fireAt - Date.now()), async (fresh, server) => {
    if (fresh.rounds.length - 1 !== roundIndex) return
    const freshRound = latestRound(fresh)
    if (!freshRound || !isClassicGroupRound(freshRound.groupChallenge)) return

    const stragglers = Object.values(fresh.players).filter(seat =>
      ROUND_SETTLE_PHASES.includes(seat.phase)
    )
    if (!stragglers.length) return

    // Grade whoever never answered through the SAME path a live submit
    // takes, then bank + advance the whole cohort through the one settlement
    // ritual. A stranded submitter keeps its banked answer and score; an
    // absentee's later genuine submit hits the groupAnswers latch and is
    // discarded — the zero stands.
    const scores: { [playerId: string]: { scored: number; maximum: number } } = {}
    for (const seat of stragglers) {
      const banked = freshRound.playerTurns[seat.id]?.points
      if (freshRound.groupAnswers[seat.id]) {
        console.warn(`Classic settle advancing stranded seat ${seat.id} in ${fresh.id}`)
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
    const advanced = await settleRoundScores({
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
    // The advanced seats now owe the table a walk only a click normally
    // sends — one cohort cap so a dead tab's scorecard can't freeze the room.
    armGroupScoresCaps(ctx, fresh, advanced)
  })
}

/**
 * The per-player reveal beat: a submit on a kind with a reveal hold banks at
 * once but keeps the seat in the challenge while the view plays its reveal
 * (pure display now — the answer is already server-side), then THIS flips
 * the seat to its scorecard. Early buzzers get their beat immediately; the
 * round-level settle stays the backstop for tabs that die mid-hold. Tokens:
 * same round, seat still in 'group-challenge', answer banked.
 */
export const scheduleRevealFlip = (ctx: EngineContext, game: Game, playerId: string) => {
  const round = latestRound(game)
  if (!round) return
  const hold = revealHoldMsFor(round.groupChallenge)
  if (!hold) return
  const roundIndex = game.rounds.length - 1
  scheduleEngineTask(ctx, hold, async (fresh, server) => {
    if (fresh.rounds.length - 1 !== roundIndex) return
    const freshRound = latestRound(fresh)
    const seat = fresh.players[playerId]
    if (!freshRound?.groupAnswers[playerId]) return
    if (!seat || seat.phase !== 'group-challenge') return
    const banked = freshRound.playerTurns[playerId]?.points
    await advanceScoredSeat(fresh, seat, banked?.scored ?? 0)
    await server.updateGameState(fresh)
    server.emit(
      { event: 'group-challenge-scored', game: fresh },
      { gameId: ctx.eventTarget.gameId, playerId }
    )
    armGroupScoresCap(ctx, seat)
  })
}

/**
 * Round-1 seam: the natural first round never passes the reveal block in
 * enter-movement-phase (start-game stages it, tutorials gate it), so the
 * clock stamps on the tutorial close that empties the rules cards — the same
 * re-entry the turn engines use for their round-1 briefings. Not the FIRST
 * close: a clock started under a slower reader's card could settle the round
 * before their tutorial cap even fires, zero-banking a live seat. The
 * tutorial caps bound how long the stamp can wait; the caller saves.
 */
export const startClassicClockOnLastClose = (game: Game): boolean => {
  const round = latestRound(game)
  if (!round || round.deadline || !isClassicGroupRound(round.groupChallenge)) return false
  const stillReading = Object.values(game.players).some(seat => seat.phase === 'tutorial')
  if (stillReading) return false
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
  // Seats whose answer banked but whose reveal flip died with the restart:
  // restore their beat (the settle would catch them anyway, later).
  for (const seat of Object.values(game.players)) {
    if (seat.phase === 'group-challenge' && round.groupAnswers[seat.id]) {
      scheduleRevealFlip(ctx, game, seat.id)
    }
  }
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
      // Round-level stamp → whole-snapshot event (a seat slice drops it).
      server.emit({ event: 'table-updated', game: fresh }, ctx.eventTarget)
    })
  }
  scheduleClassicSettle(ctx, game)
}
