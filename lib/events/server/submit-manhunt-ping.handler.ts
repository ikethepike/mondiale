import { isValidISOCode } from '~~/types/geography.types'
import { defineGameHandler } from '../server-side'
import { applyManhuntPing, currentManhunt } from './manhunt-beats'

export const submitManhuntPingHandler = defineGameHandler(
  'submit-manhunt-ping',
  async ({ game, eventData, eventTarget, io, redis, socket }) => {
    const challenge = currentManhunt(game)
    if (!challenge || challenge.state.finished) return
    // Only for the beat the detective saw; applyManhuntPing owns every other rule.
    if (eventData.turn !== challenge.state.turn) return
    if (!isValidISOCode(eventData.isoCode)) return

    await applyManhuntPing(
      { io, redis, socket, eventTarget },
      game,
      challenge,
      eventTarget.playerId,
      eventData.isoCode
    )
  }
)
