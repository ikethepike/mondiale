import { defineGameHandler } from '../server-side'
import { applyManhuntReady, currentManhunt, isManhuntParticipant } from './manhunt-beats'

export const manhuntReadyHandler = defineGameHandler(
  'manhunt-ready',
  async ({ game, eventTarget, io, redis, socket }) => {
    const challenge = currentManhunt(game)
    if (!challenge || challenge.state.finished) return
    if (!isManhuntParticipant(challenge, eventTarget.playerId)) return

    await applyManhuntReady(
      { io, redis, socket, eventTarget },
      game,
      challenge,
      eventTarget.playerId
    )
  }
)
