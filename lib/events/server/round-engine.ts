import type { Redis } from '@upstash/redis'
import type { ClientEventTarget } from '~~/types/events.types'
import type { Game, Round } from '~~/types/game.types'
import {
  enqueueGameTask,
  useServerSideEvents,
  type GameServer,
  type GameSocket,
} from '../server-side'
import { movesForScoredPoints, startWalk } from './moves'
import { REVEAL_HOLD_MS, TIMEOUT_SLACK_MS } from './turn-timing'

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
  setTimeout(() => {
    enqueueGameTask(ctx.eventTarget.gameId, async () => {
      const server = useServerSideEvents(ctx)
      const game = await server.fetchGame(ctx.eventTarget.gameId)
      if (!game) return
      await task(game, server)
    })
  }, delayMs)
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
 * Bank the finished round for the whole table: every seat's answer and
 * points land on the round, and players still parked in the challenge move
 * on with the steps their score bought. The caller guards the once-only
 * latch (`round.groupAnswers` non-empty) before calling.
 */
export const settleRoundScores = ({
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
}) => {
  for (const playerId of order) {
    const player = game.players[playerId]
    const scoring = scores[playerId] ?? { scored: 0, maximum: maximumPoints }
    round.groupAnswers[playerId] = answerFor?.(playerId) ?? { submitted: [], correct: [] }
    round.playerTurns[playerId] = { points: scoring }
    if (player && player.phase === 'group-challenge') {
      player.phase = 'group-scores'
      startWalk(player, movesForScoredPoints({ game, player, scored: scoring.scored }))
    }
  }
}
