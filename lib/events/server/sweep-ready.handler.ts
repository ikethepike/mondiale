import { defineGameHandler } from '../server-side'
import { applySweepReady, currentCleanSweep } from './sweep-beats'

export const sweepReadyHandler = defineGameHandler(
  'sweep-ready',
  async ({ game, eventTarget, io, redis, socket }) => {
    const challenge = currentCleanSweep(game)
    if (!challenge || challenge.state.finished) return

    await applySweepReady({ io, redis, socket, eventTarget }, game, challenge, eventTarget.playerId)
  }
)
