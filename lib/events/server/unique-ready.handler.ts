import { defineGameHandler } from '../server-side'
import { applyUniqueReady, currentUniqueOrBust } from './unique-beats'

export const uniqueReadyHandler = defineGameHandler(
  'unique-ready',
  async ({ game, eventTarget, io, redis, socket }) => {
    const challenge = currentUniqueOrBust(game)
    if (!challenge || challenge.state.finished) return

    await applyUniqueReady(
      { io, redis, socket, eventTarget },
      game,
      challenge,
      eventTarget.playerId
    )
  }
)
