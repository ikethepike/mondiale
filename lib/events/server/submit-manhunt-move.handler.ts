import { isValidISOCode } from '~~/types/geography.types'
import { defineGameHandler } from '../server-side'
import { applyManhuntMove, currentManhunt } from './manhunt-beats'

export const submitManhuntMoveHandler = defineGameHandler(
  'submit-manhunt-move',
  async ({ game, eventData, eventTarget, io, redis, socket }) => {
    const challenge = currentManhunt(game)
    if (!challenge || challenge.state.finished) return
    if (eventTarget.playerId !== challenge.despotId) return
    if (eventData.turn !== challenge.state.turn) return
    if (!isValidISOCode(eventData.isoCode)) return

    await applyManhuntMove({ io, redis, socket, eventTarget }, game, challenge, eventData.isoCode)
  }
)
