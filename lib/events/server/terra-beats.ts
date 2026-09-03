import { latestChallengeOfType, latestRound } from '~~/lib/rounds'
import { BRIEFING_CAP_MS } from '~~/lib/round-beats'
import type { TerraIncognitaChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import { useServerSideEvents } from '../server-side'
import { applyBriefingReady } from './briefing-gate'
import { scheduleClassicSettle, startClassicClock } from './classic-rounds'
import { scheduleEngineTask, type EngineContext, type RearmOptions } from './round-engine'

/**
 * Terra Incognita's briefing gate in front of the generic classic clock.
 *
 * The mode's premise is ONE world failing on ONE schedule, and every seat
 * derives that schedule from `Round.deadline`. So the clock must not start
 * under anyone's rules card: `startClassicClock` refuses the round while
 * `state.briefing` holds, and the last ready (or the cap) stamps it here —
 * the Clean Sweep shape, with the classic engine's own settle behind it.
 */
export const currentTerraIncognita = (game: Game): TerraIncognitaChallenge | undefined =>
  latestChallengeOfType(game, 'terra-incognita-challenge')

const roundIndexOf = (game: Game): number => game.rounds.length - 1

/** Arm the reading cap (call AFTER the save — the fired task re-reads fresh
 *  state). The armed round's index is the staleness token. */
export const scheduleTerraTimeout = (
  ctx: EngineContext,
  game: Game,
  challenge: TerraIncognitaChallenge
) => {
  if (!challenge.state.briefing) return
  const armedRound = roundIndexOf(game)
  scheduleEngineTask(ctx, BRIEFING_CAP_MS, async fresh => {
    if (roundIndexOf(fresh) !== armedRound) return
    const current = currentTerraIncognita(fresh)
    if (!current?.state.briefing) return
    await beginAtlas(ctx, fresh, current)
  })
}

/** A player dismissed their briefing card. */
export const applyTerraReady = async (
  ctx: EngineContext,
  game: Game,
  challenge: TerraIncognitaChallenge,
  playerId: string
) =>
  applyBriefingReady({
    ctx,
    game,
    state: challenge.state,
    playerId,
    participants: challenge.state.order,
    event: 'table-updated',
    begin: () => beginAtlas(ctx, game, challenge),
  })

/** Briefing over: the one classic clock starts for the whole table. */
const beginAtlas = async (ctx: EngineContext, game: Game, challenge: TerraIncognitaChallenge) => {
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
export const rearmTerraIncognita = (
  ctx: EngineContext,
  game: Game,
  options: RearmOptions = { armBriefingCaps: true }
) => {
  const challenge = currentTerraIncognita(game)
  if (!challenge?.state.briefing || !options.armBriefingCaps) return
  scheduleTerraTimeout(ctx, game, challenge)
}
