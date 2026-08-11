import {
  sweepIsComplete,
  sweepScoresFromClaims,
  sweepClaimedBy,
  SWEEP_STRAY_CAP,
} from '~~/lib/clean-sweep'
import { isChallengeOfType, latestChallengeOfType, latestRound } from '~~/lib/rounds'
import { BRIEFING_CAP_MS, FIRST_TURN_GRACE_MS, SWEEP_LOCKOUT_MS } from '~~/lib/round-beats'
import { clamp01 } from '~~/lib/number'
import type { CleanSweepChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { useServerSideEvents } from '../server-side'
import { applyBriefingReady } from './briefing-gate'
import {
  scheduleDeadlineTask,
  scheduleEngineTask,
  scheduleRevealTask,
  settleRoundScores,
  type EngineContext,
  type RearmOptions,
} from './round-engine'
import { armGroupScoresCaps } from './seat-exits'

/**
 * Clean Sweep's beat engine: the briefing gate in front of one whole-table
 * clock, with a shared pool that mutates under every claim.
 *
 * Two things separate it from its siblings, and both simplify it.
 *
 * There is NO secret. Unique or Bust hides its sheet because seeing a rival's
 * word lets you dodge the duplicate; a Clean Sweep claim carries exactly the
 * information the mode wants broadcast, so `state` rides the snapshot whole
 * and there is no side key to seed, read or delete.
 *
 * And there is no lockout TIMER. A wrong name stamps `state.benched[playerId]`
 * with a deadline; the submit path gates on it and the view counts it down.
 * Nothing to arm, nothing to lose in a restart, nothing to re-arm.
 *
 * The race that defines the mode — two seats naming the same country a
 * heartbeat apart — needs no new machinery either: every mutation runs inside
 * the per-game queue, so the handler is serialized by construction. The first
 * claims; the second re-reads fresh state, finds the slot held, and resolves
 * as a collision. The loser learns from the re-emitted snapshot rather than a
 * targeted event.
 */

export const isCleanSweepChallenge = (challenge: unknown): challenge is CleanSweepChallenge =>
  isChallengeOfType(challenge, 'clean-sweep-challenge')

/** The live round's clean-sweep challenge, when the live round is one. */
export const currentCleanSweep = (game: Game): CleanSweepChallenge | undefined =>
  latestChallengeOfType(game, 'clean-sweep-challenge')

const roundIndexOf = (game: Game): number => game.rounds.length - 1

/** Clock still standing, 0..1 — stamped onto each claim so the sweep bonus can
 *  never be re-derived against a deadline that moved afterwards. */
const remainingFraction = (challenge: CleanSweepChallenge, now: number): number =>
  clamp01((challenge.state.deadline - now) / (challenge.durationSeconds * 1000))

/**
 * Arm the round's clock (call AFTER the save — the fired task re-reads fresh
 * state). During the briefing that clock is the reading cap; after it, the
 * board's deadline. The armed round's index is the staleness token: clean
 * sweep has a single beat, so without it a stale task could resolve a LATER
 * sweep round early.
 */
export const scheduleSweepTimeout = (
  ctx: EngineContext,
  game: Game,
  challenge: CleanSweepChallenge
) => {
  const armedRound = roundIndexOf(game)
  if (challenge.state.briefing) {
    scheduleEngineTask(ctx, BRIEFING_CAP_MS, async fresh => {
      if (roundIndexOf(fresh) !== armedRound) return
      const current = currentCleanSweep(fresh)
      if (!current || current.state.finished || !current.state.briefing) return
      await beginBoard(ctx, fresh, current)
    })
    return
  }
  scheduleDeadlineTask(ctx, challenge.state.deadline, async fresh => {
    if (roundIndexOf(fresh) !== armedRound) return
    const current = currentCleanSweep(fresh)
    // A cleared board got there first — stale.
    if (!current || current.state.finished || current.state.briefing) return
    await resolveSweepBoard(ctx, fresh, current)
  })
}

/** A player dismissed their briefing card. */
export const applySweepReady = async (
  ctx: EngineContext,
  game: Game,
  challenge: CleanSweepChallenge,
  playerId: string
) =>
  applyBriefingReady({
    ctx,
    game,
    state: challenge.state,
    playerId,
    participants: challenge.state.order,
    event: 'sweep-updated',
    begin: () => beginBoard(ctx, game, challenge),
  })

/** Briefing over: the one board clock starts for the whole table. */
const beginBoard = async (ctx: EngineContext, game: Game, challenge: CleanSweepChallenge) => {
  challenge.state.briefing = false
  challenge.state.deadline = Date.now() + challenge.durationSeconds * 1000 + FIRST_TURN_GRACE_MS
  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'sweep-updated', game }, ctx.eventTarget)
  scheduleSweepTimeout(ctx, game, challenge)
}

/**
 * A player named a country. Three outcomes, all resolved here so the client's
 * optimism is never the authority:
 *
 *  • on the board and free → CLAIMED, theirs for the round;
 *  • on the board and held → a collision. No bench: they were right, they were
 *    late, and the seconds are the whole cost;
 *  • not on the board → a stray, and the bench.
 *
 * A benched seat's claim is refused outright. Every rejection is a state-free
 * return: the client already knows what it typed, and the re-emitted snapshot
 * (or its absence) is what it reconciles against.
 */
export const applySweepClaim = async (
  ctx: EngineContext,
  game: Game,
  challenge: CleanSweepChallenge,
  playerId: string,
  isoCode: ISOCountryCode
) => {
  const { state } = challenge
  if (state.briefing || state.finished) return
  if (!state.order.includes(playerId)) return

  const now = Date.now()
  if ((state.benched[playerId] ?? 0) > now) return

  const server = useServerSideEvents(ctx)

  if (!challenge.members.includes(isoCode)) {
    // The bench is the mode's whole penalty — a stamp the view counts down.
    state.benched[playerId] = now + SWEEP_LOCKOUT_MS
    // Capped: the reveal shows the table's misses, not an unbounded log a
    // determined typist could grow the snapshot with.
    if (state.strays.length < SWEEP_STRAY_CAP) state.strays.push({ isoCode, playerId })
    await server.updateGameState(game)
    server.emit({ event: 'sweep-updated', game }, ctx.eventTarget)
    return
  }

  // The race, decided by the per-game queue rather than a lock: whoever's
  // mutation ran first is already here.
  if (sweepClaimedBy(challenge)[isoCode]) return

  state.claims.push({
    isoCode,
    playerId,
    at: now,
    remaining: remainingFraction(challenge, now),
  })

  if (sweepIsComplete(challenge)) return resolveSweepBoard(ctx, game, challenge)

  await server.updateGameState(game)
  server.emit({ event: 'sweep-updated', game }, ctx.eventTarget)
}

/**
 * Time, or the last slot: freeze the board. The reveal holds on the resolved
 * roster — who took what, and the slots nobody found — then the table settles
 * through the shared ritual.
 */
const resolveSweepBoard = async (
  ctx: EngineContext,
  game: Game,
  challenge: CleanSweepChallenge
) => {
  challenge.state.finished = true
  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'sweep-updated', game }, ctx.eventTarget)

  scheduleSweepSettle(ctx)
}

/** Arm the finished board's settle follow-up. Scores are a pure function of
 *  the claims already on the snapshot, so re-arming (rejoin recovery) is safe:
 *  the `groupAnswers` latch makes any duplicate a no-op, and there is no blob
 *  whose TTL could lapse under a late-recovered settle. */
const scheduleSweepSettle = (ctx: EngineContext) => {
  scheduleRevealTask(ctx, async (fresh, freshServer) => {
    const current = currentCleanSweep(fresh)
    if (!current?.state.finished) return

    const round = latestRound(fresh)
    // The reveal follow-up fires exactly once: scoring marks the round.
    if (!round || Object.keys(round.groupAnswers).length) return

    const claimedBy = sweepClaimedBy(current)
    const advanced = await settleRoundScores({
      game: fresh,
      round,
      order: current.state.order,
      scores: sweepScoresFromClaims(current),
      maximumPoints: current.maximumPoints,
      // The seat's own claims against the whole board. The scorecard's ledger
      // reads the claim map alongside these, so a rival's slot reads "taken"
      // rather than libelling the seat for missing it.
      answerFor: playerId => ({
        submitted: current.members.filter(isoCode => claimedBy[isoCode] === playerId),
        correct: current.members,
      }),
    })

    await freshServer.updateGameState(fresh)
    // Not 'group-challenge-scored': its client handler applies only the target
    // player's slice, and this scoring lands for the whole table.
    freshServer.emit({ event: 'sweep-updated', game: fresh }, ctx.eventTarget)
    armGroupScoresCaps(ctx, fresh, advanced)
  })
}

/**
 * Re-arm whatever follow-up the live sweep round is waiting on after its
 * in-process timer was lost (restart, or a save that threw once the timer was
 * already spent). Called from the rejoin recovery path (rearm-round.ts); safe
 * alongside a live timer — every task dies on its round/briefing/finished
 * token or the settle latch.
 */
export const rearmCleanSweep = (
  ctx: EngineContext,
  game: Game,
  options: RearmOptions = { armBriefingCaps: true }
) => {
  const challenge = currentCleanSweep(game)
  if (!challenge) return
  // Finished but unsettled — the reveal hold died before banking the table.
  if (challenge.state.finished) return scheduleSweepSettle(ctx)
  // The one shape a rearm may not touch: a briefing cap while the caller says
  // rules cards are still up (round-1 seam) — close-tutorial owns that arm.
  if (challenge.state.briefing && !options.armBriefingCaps) return
  scheduleSweepTimeout(ctx, game, challenge)
}
