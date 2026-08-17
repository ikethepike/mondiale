import {
  activeTimelinePlayerId,
  drawnCard,
  placedYears,
  resolveSlot,
  scoreTimeline,
  timelineEvent,
} from '~~/lib/timeline'
import type { TimelineChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import { useServerSideEvents } from '../server-side'
import type { ChainContext } from './chain-turns'
import {
  FIRST_TURN_GRACE_MS,
  REVEAL_HOLD_MS,
  roundBeats,
  TIMELINE_BROWSE_CAP_MS,
  TIMEOUT_SLACK_MS,
} from '~~/lib/round-beats'
import { isChallengeOfType, latestChallengeOfType, latestRound } from '~~/lib/rounds'
import { applyGateAck } from './briefing-gate'
import {
  scheduleDeadlineTask,
  scheduleEngineTask,
  type ServerSide,
  settleRoundScores,
} from './round-engine'
import { armGroupScoresCaps } from './seat-exits'

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

/** May this actor place on this turn? ONE guard for both callers of
 *  `resolveTimelinePlacement` (the wire handler and the bot brain) — the
 *  resolver itself deliberately trusts its caller, so a guard tightened in
 *  one caller only is a drift bug waiting. */
export const mayPlaceTimeline = (
  challenge: TimelineChallenge,
  playerId: string,
  turn: number
): boolean => {
  const { state } = challenge
  if (state.finished || state.revealing) return false
  return activeTimelinePlayerId(state) === playerId && state.turn === turn
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
 * Settle the drawn card: the verdict and how crowded the call was for a chosen
 * slot, nothing for a timeout — then file the card into its true position (the
 * line must stay sorted for every later placement) and hold on the story card.
 *
 * Points are NOT struck here. A card's value depends on the rest of the hand
 * the seat is dealt, which isn't known until the deck runs out, so the turn
 * records the weight and `scoreTimeline` converts the whole round at settle.
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

  state.placements.push({
    playerId,
    slug,
    chosenSlot: chosenSlot ?? slot,
    correctSlot: slot,
    correct,
    slotCount: state.placed.length + 1,
    kind: chosenSlot === undefined ? 'timeout' : 'placed',
  })
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

/** The finished chronicle's browse allowance — the one player-paced beat.
 *  The fallback is the SAME named token the spec row carries, so a dropped
 *  spec field can never quietly shrink the window the tests assert. */
const timelineBrowseCapMs = (challenge: TimelineChallenge): number =>
  roundBeats(challenge).browseCapMs ?? TIMELINE_BROWSE_CAP_MS

/**
 * Deck exhausted: freeze the finished line for the BROWSABLE reveal — every
 * event's story is on the table and worth reading, so settle waits for each
 * seat's reveal-done ack (or the browse cap), then banks every player's
 * points through the same conversion the submit path uses.
 */
const finishTimelineRound = async (ctx: ChainContext, game: Game, challenge: TimelineChallenge) => {
  const { state } = challenge
  const server = useServerSideEvents(ctx)

  state.finished = true
  state.revealing = false
  state.revealDone = []
  // The shared browse clock: clients count the cap down from this.
  state.deadline = Date.now() + timelineBrowseCapMs(challenge)

  await server.updateGameState(game)
  server.emit({ event: 'timeline-updated', game }, ctx.eventTarget)

  scheduleTimelineSettle(ctx, challenge)
}

/**
 * The table-atomic settle both exits share: the browse cap firing, and the
 * last seat's reveal-done ack. The `groupAnswers` latch makes the race
 * harmless — whichever lands second is a no-op.
 */
const settleTimeline = async (ctx: ChainContext, fresh: Game, freshServer: ServerSide) => {
  const current = currentTimeline(fresh)
  if (!current?.state.finished) return

  const round = latestRound(fresh)
  // The reveal follow-up fires exactly once: scoring marks the round.
  if (!round || Object.keys(round.groupAnswers).length) return

  const advanced = await settleRoundScores({
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
  // The advanced seats now owe the table a movement request only a click
  // sends — one cohort cap so a dead tab can't freeze the room here.
  armGroupScoresCaps(ctx, fresh, advanced)
}

/** Arm the browse cap's settle backstop against the PERSISTED deadline —
 *  a restart re-arms the remaining window, never a fresh full cap. Floored
 *  at the classic reveal hold: a round finished under a PREVIOUS deploy
 *  carries a stale past deadline (no browse restamp ever ran), and settling
 *  it ~instantly on rejoin would hand the table zero reading time. Safe to
 *  arm twice: the settle dies on the `groupAnswers` latch. */
const scheduleTimelineSettle = (ctx: ChainContext, challenge: TimelineChallenge) => {
  const remainingMs = Math.max(challenge.state.deadline - Date.now(), REVEAL_HOLD_MS)
  scheduleEngineTask(ctx, remainingMs + TIMEOUT_SLACK_MS, (fresh, freshServer) =>
    settleTimeline(ctx, fresh, freshServer)
  )
}

/**
 * A seat finished reading the chronicle — the shared gate collector owns the
 * rules (idempotent, participant-only, last ack completes, whole-table
 * repaint short of it); this supplies only the timeline's shapes: the settle
 * latch as the gate, `revealDone` as the ack array, the settle as the exit.
 */
export const handleTimelineRevealDone = async (ctx: ChainContext, game: Game, playerId: string) => {
  const challenge = currentTimeline(game)
  if (!challenge?.state.finished) return
  const round = latestRound(game)
  if (!round) return

  const server = useServerSideEvents(ctx)
  await applyGateAck({
    ctx,
    game,
    playerId,
    participants: challenge.state.order,
    event: 'timeline-updated',
    open: () => !Object.keys(round.groupAnswers).length,
    acked: (challenge.state.revealDone ??= []),
    complete: () => settleTimeline(ctx, game, server),
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
  // Finished but unsettled — the browse backstop died before banking the
  // table. Re-arms against the persisted deadline: the remaining window.
  if (challenge.state.finished) return scheduleTimelineSettle(ctx, challenge)
  if (challenge.state.revealing) return scheduleTimelineReveal(ctx, challenge)
  // A zero deadline is the staged-but-unrevealed shape (the clock stamps at
  // the reveal) — arming against it would time out turn 0 before anyone saw it.
  if (challenge.state.deadline === 0) return
  scheduleTimelineTimeout(ctx, challenge)
}
