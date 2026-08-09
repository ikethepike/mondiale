import { defineGameHandler } from '../server-side'
import { handleAtlasChainReady } from './atlas-turns'
import { handleBorderChainReady } from './chain-turns'

/** A dismissed briefing card, for whichever turn-chain round is live — each
 *  engine self-selects on its own challenge, so at most one acts. */
export const chainReadyHandler = defineGameHandler(
  'chain-ready',
  async ({ game, eventTarget, io, redis, socket }) => {
    const ctx = { io, redis, socket, eventTarget }
    await handleBorderChainReady(ctx, game, eventTarget.playerId)
    await handleAtlasChainReady(ctx, game, eventTarget.playerId)
  }
)
