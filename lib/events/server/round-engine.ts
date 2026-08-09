import type { Redis } from '@upstash/redis'
import type { ClientEventTarget } from '~~/types/events.types'
import type { Game, Round } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { useServerSideEvents, type GameServer, type GameSocket } from '../server-side'
import { scheduleGameTask } from './deferred-task'
import { movesForScoredPoints, startWalk } from './moves'
import { REVEAL_HOLD_MS, ROUND_SETTLE_PHASES, TIMEOUT_SLACK_MS } from '~~/lib/round-beats'

/**
 * The scaffolding every clocked round engine (chain-turns, timeline-turns,
 * manhunt-beats, heritage-beats) shares: timers armed OUTSIDE the per-game
 * queue, follow-ups that re-enter it with a fresh fetch, and one settlement
 * ritual that banks the whole table's scores. Engines write their mode logic
 * only — the rhythm and the award loop must never fork again.
 */

export interface EngineContext {
  io: GameServer
  redis: Redis
  socket: GameSocket
  eventTarget: ClientEventTarget
}

/** Options every engine's rearm entry accepts (see rearm-round.ts). */
export interface RearmOptions {
  /** False while tutorials are still up (the forced round-1 seam): a briefing
   *  cap must not force-start a round under a rules card. ONLY the briefing
   *  branch is gated — trap resumes, reveal holds, shot clocks and settle
   *  tasks are all safe (and necessary) to re-arm regardless, or a restart
   *  mid-round-1 with one AFK tutorial seat would strand the whole recovery. */
  armBriefingCaps: boolean
}

type ServerSide = ReturnType<typeof useServerSideEvents>

/**
 * Run `task` through the per-game queue after `delayMs`, with a fresh game
 * fetch. The timer holds no lock; the task must re-derive its own staleness
 * (turn/beat token checks) from the fresh state.
 */
export const scheduleEngineTask = (
  ctx: EngineContext,
  delayMs: number,
  task: (game: Game, server: ServerSide) => Promise<void>
) => {
  scheduleGameTask({ redis: ctx.redis, gameId: ctx.eventTarget.gameId }, delayMs, async () => {
    const server = useServerSideEvents(ctx)
    const game = await server.fetchGame(ctx.eventTarget.gameId)
    if (!game) return
    await task(game, server)
  })
}

/** A shot-clock follow-up: fires just after `deadline`, with buzzer slack. */
export const scheduleDeadlineTask = (
  ctx: EngineContext,
  deadline: number,
  task: (game: Game, server: ServerSide) => Promise<void>
) => scheduleEngineTask(ctx, Math.max(0, deadline - Date.now()) + TIMEOUT_SLACK_MS, task)

/** A post-round basking-beat follow-up (the reveal hold). */
export const scheduleRevealTask = (
  ctx: EngineContext,
  task: (game: Game, server: ServerSide) => Promise<void>
) => scheduleEngineTask(ctx, REVEAL_HOLD_MS, task)

/**
 * THE per-seat advance out of a scored round: flip to the scorecard and walk
 * the steps the score bought. Every path that moves a seat past its answer —
 * the submit handler's flip, its stranded-submitter heal, whole-table
 * settles, the classic reveal flip — runs through here, never a private
 * phase-and-walk of its own.
 */
export const advanceScoredSeat = async (game: Game, player: Player, scored: number) => {
  player.phase = 'group-scores'
  startWalk(player, await movesForScoredPoints({ game, player, scored }))
}

/**
 * Bank the finished round for the whole table: every seat's answer and
 * points land on the round, and players still parked in the challenge move
 * on with the steps their score bought. The caller guards the once-only
 * latch (`round.groupAnswers` non-empty) before calling. Returns the seats
 * it advanced, so callers can arm their scorecard caps after the save.
 */
export const settleRoundScores = async ({
  game,
  round,
  order,
  scores,
  maximumPoints,
  answerFor,
}: {
  game: Game
  round: Round
  order: readonly string[]
  scores: { [playerId: string]: { scored: number; maximum: number } }
  maximumPoints: number
  /** Mode-specific scorecard answer; empty submitted/correct when omitted. */
  answerFor?: (playerId: string) => Round['groupAnswers'][string]
}): Promise<string[]> => {
  const advanced: string[] = []
  for (const playerId of order) {
    const player = game.players[playerId]
    const scoring = scores[playerId] ?? { scored: 0, maximum: maximumPoints }
    round.groupAnswers[playerId] = answerFor?.(playerId) ?? { submitted: [], correct: [] }
    round.playerTurns[playerId] = { points: scoring }
    // Any seat IN the round advances — 'group-challenge' or parked behind
    // the round-1 rules card ('tutorial'), which would otherwise hold
    // `tableIsSettled` false forever. NOT the wider walk-exemption bucket:
    // a late joiner still typing their name was never dealt in, and walkable
    // phases ('moving', 'group-scores') already banked and are mid-walk —
    // re-walking one is the mid-round ejection class.
    if (player && ROUND_SETTLE_PHASES.includes(player.phase)) {
      await advanceScoredSeat(game, player, scoring.scored)
      advanced.push(playerId)
    }
  }
  return advanced
}
