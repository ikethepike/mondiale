import { latestRound } from '~~/lib/rounds'
import {
  BRIEFING_CAP_MS,
  isBriefedClassic,
  roundBeats,
  type BriefedClassicChallenge,
} from '~~/lib/round-beats'
import type { Game } from '~~/types/game.types'
import { useServerSideEvents } from '../server-side'
import { applyBriefingReady } from './briefing-gate'
import { scheduleClassicSettle, startClassicClock } from './classic-rounds'
import { scheduleEngineTask, type EngineContext, type RearmOptions } from './round-engine'

/**
 * The briefing gate in front of the generic classic clock, for the classic
 * kinds that open on a rules card. `startClassicClock` refuses the round while
 * `state.briefing` holds, and the last ready (or the cap) stamps it here —
 * one stamp, so every seat derives the same schedule from `Round.deadline`
 * (Terra's failing world, Unmask's rungs).
 */
export const currentBriefedClassic = (game: Game): BriefedClassicChallenge | undefined => {
  const challenge = latestRound(game)?.groupChallenge
  return isBriefedClassic(challenge) ? challenge : undefined
}

const roundIndexOf = (game: Game): number => game.rounds.length - 1

/** Arm the reading cap (call AFTER the save — the fired task re-reads fresh
 *  state). The armed round's index is the staleness token. */
export const scheduleClassicBriefingTimeout = (
  ctx: EngineContext,
  game: Game,
  challenge: BriefedClassicChallenge
) => {
  if (!challenge.state.briefing) return
  const armedRound = roundIndexOf(game)
  scheduleEngineTask(ctx, roundBeats(challenge).briefingCapMs ?? BRIEFING_CAP_MS, async fresh => {
    if (roundIndexOf(fresh) !== armedRound) return
    const current = currentBriefedClassic(fresh)
    if (!current?.state.briefing) return
    await beginClassic(ctx, fresh, current)
  })
}

/** A player dismissed their briefing card. */
export const applyClassicReady = async (
  ctx: EngineContext,
  game: Game,
  challenge: BriefedClassicChallenge,
  playerId: string
) =>
  applyBriefingReady({
    ctx,
    game,
    state: challenge.state,
    playerId,
    participants: challenge.state.order,
    event: 'table-updated',
    begin: () => beginClassic(ctx, game, challenge),
  })

/** Briefing over: the one classic clock starts for the whole table. */
const beginClassic = async (ctx: EngineContext, game: Game, challenge: BriefedClassicChallenge) => {
  challenge.state.briefing = false
  const round = latestRound(game)
  if (round) startClassicClock(round)
  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event: 'table-updated', game }, ctx.eventTarget)
  scheduleClassicSettle(ctx, game)
}

/** The briefing cap is the one follow-up the classic rearm cannot own — a
 *  round with no deadline is otherwise a round waiting to be revealed. */
export const rearmClassicBriefing = (
  ctx: EngineContext,
  game: Game,
  options: RearmOptions = { armBriefingCaps: true }
) => {
  const challenge = currentBriefedClassic(game)
  if (!challenge?.state.briefing || !options.armBriefingCaps) return
  scheduleClassicBriefingTimeout(ctx, game, challenge)
}
