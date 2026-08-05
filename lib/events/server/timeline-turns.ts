import {
  activeTimelinePlayerId,
  drawnCard,
  perCardPoints,
  placedYears,
  resolveSlot,
  scoreTimeline,
  slotDensityFraction,
  timelineEvent,
} from '~~/lib/timeline'
import type { TimelineChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import { useServerSideEvents } from '../server-side'
import type { ChainContext } from './chain-turns'
import { FIRST_TURN_GRACE_MS, TIMEOUT_SLACK_MS } from './turn-timing'
import { isChallengeOfType, latestChallengeOfType, latestRound } from '~~/lib/rounds'
import {
  scheduleDeadlineTask,
  scheduleEngineTask,
  scheduleRevealTask,
  settleRoundScores,
} from './round-engine'

/**
 * Timeline's turn engine — chain-turns' rotation crossed with heritage-beats'
 * reveal hold. One player on the clock at a time slots the drawn card into the
 * shared line; every resolution (right, wrong, or timed out) files the card
 * where it belongs and holds on its story card so the whole table learns the
 * date, then the next player draws. Timers run outside the per-game queue;
 * the (turn, revealing) pair is the staleness token.
 */

export const isTimelineChallenge = (challenge: unknown): challenge is TimelineChallenge =>
  isChallengeOfType(challenge, 'timeline-challenge')

/** The live round's timeline challenge, when the live round is one. */
export const currentTimeline = (game: Game): TimelineChallenge | undefined =>
  latestChallengeOfType(game, 'timeline-challenge')

const stampTurnDeadline = (challenge: TimelineChallenge, extraMs = 0) => {
  challenge.state.deadline = Date.now() + challenge.turnSeconds * 1000 + extraMs
}

/**
 * Kick off the revealed round: stamp the first deadline (call BEFORE the
 * caller saves/emits so clients see a live clock) …
 */
export const startTimelineClock = (challenge: TimelineChallenge) => {
  stampTurnDeadline(challenge, FIRST_TURN_GRACE_MS)
}

/** … then arm the shot clock (call AFTER the save — it re-reads fresh state). */
export const scheduleTimelineTimeout = (ctx: ChainContext, challenge: TimelineChallenge) => {
  const { turn, deadline } = challenge.state
  scheduleDeadlineTask(ctx, deadline, async game => {
    const current = currentTimeline(game)
    // A placement or the reveal advanced the state — this timeout is stale.
    if (!current || current.state.finished || current.state.revealing) return
    if (current.state.turn !== turn) return
    await resolveTimelinePlacement(ctx, game, current, undefined)
  })
}

/**
 * Settle the drawn card: verdict and banked points for a chosen slot, nothing
 * for a timeout — then file the card into its true position (the line must
 * stay sorted for every later placement) and hold on the story card.
 */
export const resolveTimelinePlacement = async (
  ctx: ChainContext,
  game: Game,
  challenge: TimelineChallenge,
  chosenSlot: number | undefined
) => {
  const { state } = challenge
  const playerId = activeTimelinePlayerId(state)
  const slug = drawnCard(state)
  const event = slug ? timelineEvent(slug) : undefined
  if (!slug || !event) return finishTimelineRound(ctx, game, challenge)

  // A timeout files the card as if placed below the line's floor — resolveSlot
  // clamps it into the true position and the verdict stays a miss.
  const { correct, slot } = resolveSlot(placedYears(state.placed), event.year, chosenSlot ?? -1)
  const scored = correct
    ? Math.round(
        perCardPoints(challenge) * slotDensityFraction(state.placed.length + 1, state.deck.length)
      )
    : 0

  state.placements.push({
    playerId,
    slug,
    chosenSlot: chosenSlot ?? slot,
    correctSlot: slot,
    correct,
    scored,
    kind: chosenSlot === undefined ? 'timeout' : 'placed',
  })
  if (scored) state.banked[playerId] = (state.banked[playerId] ?? 0) + scored
  state.placed.splice(slot, 0, slug)

  // Hold on the story card so the whole table reads the year it teaches.
  state.revealing = true
  state.deadline = Date.now() + challenge.revealSeconds * 1000

  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'timeline-updated', game }, ctx.eventTarget)

  scheduleTimelineReveal(ctx, challenge)
}

/** Arm the story card's own hold: not the shot clock, so scheduleEngineTask
 *  with the reveal's fixed length plus the usual buzzer slack. Idempotent:
 *  the fired task re-reads fresh state and bails once the turn moved on. */
const scheduleTimelineReveal = (ctx: ChainContext, challenge: TimelineChallenge) => {
  const revealedTurn = challenge.state.turn
  scheduleEngineTask(ctx, challenge.revealSeconds * 1000 + TIMEOUT_SLACK_MS, async fresh => {
    const current = currentTimeline(fresh)
    if (!current?.state.revealing || current.state.finished) return
    if (current.state.turn !== revealedTurn) return
    await advanceTimelineTurn(ctx, fresh, current)
  })
}

/** The reveal hold elapsed: draw the next card or close the round. */
const advanceTimelineTurn = async (ctx: ChainContext, game: Game, challenge: TimelineChallenge) => {
  const { state } = challenge

  if (state.card >= challenge.state.deck.length - 1) {
    return finishTimelineRound(ctx, game, challenge)
  }

  state.revealing = false
  state.card++
  state.activeIndex = (state.activeIndex + 1) % state.order.length
  state.turn++
  stampTurnDeadline(challenge)

  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'timeline-updated', game }, ctx.eventTarget)
  scheduleTimelineTimeout(ctx, challenge)
}

/**
 * Deck exhausted: freeze the finished line for the reveal beat, then bank
 * every player's points through the same conversion the submit path uses.
 */
const finishTimelineRound = async (ctx: ChainContext, game: Game, challenge: TimelineChallenge) => {
  const { state } = challenge
  const server = useServerSideEvents(ctx)

  state.finished = true
  state.revealing = false

  await server.updateGameState(game)
  server.emit({ event: 'timeline-updated', game }, ctx.eventTarget)

  scheduleTimelineSettle(ctx)
}

/** Arm the finished round's settle follow-up. Everything is re-derived from
 *  fresh state inside the task, so re-arming (rejoin recovery) is safe: the
 *  `groupAnswers` latch makes any duplicate a no-op. */
const scheduleTimelineSettle = (ctx: ChainContext) => {
  scheduleRevealTask(ctx, async (fresh, freshServer) => {
    const current = currentTimeline(fresh)
    if (!current?.state.finished) return

    const round = latestRound(fresh)
    // The reveal follow-up fires exactly once: scoring marks the round.
    if (!round || Object.keys(round.groupAnswers).length) return

    await settleRoundScores({
      game: fresh,
      round,
      order: current.state.order,
      scores: scoreTimeline(current),
      maximumPoints: current.maximumPoints,
      answerFor: playerId => {
        const mine = current.state.placements.filter(entry => entry.playerId === playerId)
        return {
          submitted: mine.flatMap(entry => {
            const country = timelineEvent(entry.slug)?.country
            return country ? [country] : []
          }),
          correct: mine.flatMap(entry => {
            const country = timelineEvent(entry.slug)?.country
            return entry.correct && country ? [country] : []
          }),
        }
      },
    })

    await freshServer.updateGameState(fresh)
    // Not 'group-challenge-scored': its client handler applies only the
    // target player's slice, and this scoring lands for the whole table.
    freshServer.emit({ event: 'timeline-updated', game: fresh }, ctx.eventTarget)
  })
}

/**
 * Re-arm whatever follow-up the live timeline round is waiting on after its
 * in-process timer was lost (restart, or a save that threw once the timer was
 * already spent). Called from the rejoin recovery path (rearm-round.ts); safe
 * alongside a live timer — every task dies on its (turn, revealing, finished)
 * token or the settle latch.
 */
export const rearmTimeline = (ctx: ChainContext, game: Game) => {
  const challenge = currentTimeline(game)
  if (!challenge) return
  // Finished but unsettled — the reveal hold died before banking the table.
  if (challenge.state.finished) return scheduleTimelineSettle(ctx)
  if (challenge.state.revealing) return scheduleTimelineReveal(ctx, challenge)
  // A zero deadline is the staged-but-unrevealed shape (the clock stamps at
  // the reveal) — arming against it would time out turn 0 before anyone saw it.
  if (challenge.state.deadline === 0) return
  scheduleTimelineTimeout(ctx, challenge)
}
