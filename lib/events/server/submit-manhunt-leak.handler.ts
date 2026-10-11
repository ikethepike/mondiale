import { defineGameHandler } from '../server-side'
import { applyManhuntLeak, currentManhunt } from './manhunt-beats'

export const submitManhuntLeakHandler = defineGameHandler(
  'submit-manhunt-leak',
  async ({ game, eventData, eventTarget, io, redis, socket }) => {
    const challenge = currentManhunt(game)
    if (!challenge || challenge.state.finished) return
    if (eventTarget.playerId !== challenge.despotId) return
    if (eventData.turn !== challenge.state.turn) return

    await applyManhuntLeak({ io, redis, socket, eventTarget }, game, challenge, eventData.index)
  }
)
