import { defineGameHandler } from '../server-side'
import { applyManhuntReady, currentManhunt } from './manhunt-beats'

export const manhuntReadyHandler = defineGameHandler(
  'manhunt-ready',
  async ({ game, eventTarget, io, redis, socket }) => {
    const challenge = currentManhunt(game)
    if (!challenge || challenge.state.finished) return
    const participant =
      eventTarget.playerId === challenge.despotId ||
      challenge.state.detectives.includes(eventTarget.playerId)
    if (!participant) return

    await applyManhuntReady(
      { io, redis, socket, eventTarget },
      game,
      challenge,
      eventTarget.playerId
    )
  }
)
