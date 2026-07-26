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
import { enqueueGameTask, useServerSideEvents } from '../server-side'
import type { ChainContext } from './chain-turns'
import { movesForScoredPoints } from './moves'

/**
 * Timeline's turn engine — chain-turns' rotation crossed with heritage-beats'
 * reveal hold. One player on the clock at a time slots the drawn card into the
 * shared line; every resolution (right, wrong, or timed out) files the card
 * where it belongs and holds on its story card so the whole table learns the
 * date, then the next player draws. Timers run outside the per-game queue;
 * the (turn, revealing) pair is the staleness token.
 */

/** Post-round basking time before scores, matching the challenge handlers' 5s. */
const REVEAL_HOLD_MS = 6000
/** Buzzer grace so an on-the-wire placement beats its own turn's timeout. */
const TIMEOUT_SLACK_MS = 350
/** Extra opening-turn time — the first clock starts behind the interstitial. */
const FIRST_TURN_GRACE_MS = 4000

export const isTimelineChallenge = (challenge: unknown): challenge is TimelineChallenge =>
  !!challenge &&
  typeof challenge === 'object' &&
  '_type' in challenge &&
  challenge._type === 'timeline-challenge'

/** The live round's timeline challenge, when the live round is one. */
export const currentTimeline = (game: Game): TimelineChallenge | undefined => {
  const challenge = game.rounds[game.rounds.length - 1]?.groupChallenge
  return isTimelineChallenge(challenge) ? challenge : undefined
}

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
  const delay = Math.max(0, deadline - Date.now()) + TIMEOUT_SLACK_MS
  setTimeout(() => {
    enqueueGameTask(ctx.eventTarget.gameId, async () => {
      const server = useServerSideEvents(ctx)
      const game = await server.fetchGame(ctx.eventTarget.gameId)
      if (!game) return
      const current = currentTimeline(game)
      // A placement or the reveal advanced the state — this timeout is stale.
      if (!current || current.state.finished || current.state.revealing) return
      if (current.state.turn !== turn) return
      await resolveTimelinePlacement(ctx, game, current, undefined)
    })
  }, delay)
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

  const revealedTurn = state.turn
  setTimeout(
    () => {
      enqueueGameTask(ctx.eventTarget.gameId, async () => {
        const fresh = await server.fetchGame(ctx.eventTarget.gameId)
        if (!fresh) return
        const current = currentTimeline(fresh)
        if (!current?.state.revealing || current.state.finished) return
        if (current.state.turn !== revealedTurn) return
        await advanceTimelineTurn(ctx, fresh, current)
      })
    },
    challenge.revealSeconds * 1000 + TIMEOUT_SLACK_MS
  )
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

  setTimeout(() => {
    enqueueGameTask(ctx.eventTarget.gameId, async () => {
      const fresh = await server.fetchGame(ctx.eventTarget.gameId)
      if (!fresh) return
      const current = currentTimeline(fresh)
      if (!current?.state.finished) return

      const round = fresh.rounds[fresh.rounds.length - 1]
      // The reveal follow-up fires exactly once: scoring marks the round.
      if (Object.keys(round.groupAnswers).length) return

      const scores = scoreTimeline(current)
      for (const playerId of current.state.order) {
        const player = fresh.players[playerId]
        const scoring = scores[playerId] ?? { scored: 0, maximum: current.maximumPoints }
        const mine = current.state.placements.filter(entry => entry.playerId === playerId)
        round.groupAnswers[playerId] = {
          submitted: mine.flatMap(entry => {
            const country = timelineEvent(entry.slug)?.country
            return country ? [country] : []
          }),
          correct: mine.flatMap(entry => {
            const country = timelineEvent(entry.slug)?.country
            return entry.correct && country ? [country] : []
          }),
        }
        round.playerTurns[playerId] = { points: scoring }
        if (player && player.phase === 'group-challenge') {
          player.phase = 'group-scores'
          player.moves = movesForScoredPoints({ game: fresh, player, scored: scoring.scored })
        }
      }

      await server.updateGameState(fresh)
      // Not 'group-challenge-scored': its client handler applies only the
      // target player's slice, and this scoring lands for the whole table.
      server.emit({ event: 'timeline-updated', game: fresh }, ctx.eventTarget)
    })
  }, REVEAL_HOLD_MS)
}
