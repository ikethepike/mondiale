import { defineGameHandler } from '../server-side'
import { applyGovernmentReady, currentGovernment } from './government-beats'

export const governmentReadyHandler = defineGameHandler(
  'government-ready',
  async ({ game, eventTarget, io, redis, socket }) => {
    const challenge = currentGovernment(game)
    if (!challenge || challenge.state.finished) return

    await applyGovernmentReady(
      { io, redis, socket, eventTarget },
      game,
      challenge,
      eventTarget.playerId
    )
  }
)
