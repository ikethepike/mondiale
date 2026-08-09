import { defineGameHandler } from '../server-side'
import { handleAtlasChainMove } from './atlas-turns'
import { handleBorderChainMove } from './chain-turns'

/**
 * One wire event for every turn-chain round: each engine self-selects on its
 * own live challenge (at most one acts), and all the guards — briefing, trap
 * hold, active seat, the `turn` idempotency token, ISO validity, the link
 * rule itself — live in the shared engine's handleMove.
 */
export const submitChainMoveHandler = defineGameHandler(
  'submit-chain-move',
  async ({ game, eventData, eventTarget, io, redis, socket }) => {
    const ctx = { io, redis, socket, eventTarget }
    await handleBorderChainMove(ctx, game, eventData, eventTarget.playerId)
    await handleAtlasChainMove(ctx, game, eventData, eventTarget.playerId)
  }
)
