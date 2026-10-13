import { defineGameHandler } from '../server-side'
import { handleAtlasRipCord } from './atlas-turns'

/** The seat on the clock trades the live chain for a fresh seed. All guards —
 *  briefing, trap hold, active seat, the `turn` token, a cord left — live in
 *  the shared engine's handleRipCord. */
export const pullRipCordHandler = defineGameHandler(
  'pull-rip-cord',
  async ({ game, eventData, eventTarget, io, redis, socket }) => {
    const ctx = { io, redis, socket, eventTarget }
    await handleAtlasRipCord(ctx, game, eventData, eventTarget.playerId)
  }
)
