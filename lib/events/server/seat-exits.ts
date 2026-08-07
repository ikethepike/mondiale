import { GROUP_SCORES_CAP_MS, SERVER_CONTROLLED_CAPS } from '~~/lib/round-beats'
import type { Player } from '~~/types/player.type'
import { scheduleMovementPhase } from './enter-movement-phase.handler'
import { scheduleEngineTask, type EngineContext } from './round-engine'

/**
 * Server-owned exits for seats parked OUTSIDE a round's own clock. Every
 * phase a player can occupy must have one of these (or a round engine)
 * guaranteeing it ends — a seat only a click can move is a frozen room
 * waiting to happen. All of them are gated on SERVER_CONTROLLED_CAPS and
 * are safe to arm twice: each fires through a fresh fetch and dies on its
 * staleness token.
 */

/**
 * A seat on its scorecard owes the table a movement request that only a
 * click sends. Cap it: after the reading beat the server walks the seat
 * itself, through the one movement re-entry (`scheduleMovementPhase`).
 * Tokens: the seat must still be parked in 'group-scores' — a walking or
 * walked seat is a client-driven chain the cap must not double-step — and
 * on the same walk generation it was armed against.
 */
export const armGroupScoresCap = (ctx: EngineContext, player: Player) => {
  if (!SERVER_CONTROLLED_CAPS) return
  const { walkSeq, id: playerId } = player
  scheduleEngineTask(ctx, GROUP_SCORES_CAP_MS, async fresh => {
    const parked = fresh.players[playerId]
    if (!parked || parked.phase !== 'group-scores') return
    if (parked.walkSeq !== walkSeq) return
    console.warn(`Scores cap walking parked seat ${playerId} in ${ctx.eventTarget.gameId}`)
    scheduleMovementPhase(
      0,
      { ...ctx, eventTarget: { gameId: ctx.eventTarget.gameId, playerId } },
      { continuation: true, walkSeq }
    )
  })
}
