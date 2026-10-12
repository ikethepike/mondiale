import { isValidISOCode } from '~~/types/geography.types'
import { defineGameHandler } from '../server-side'
import { applyManhuntClaim, currentManhunt } from './manhunt-beats'

export const submitManhuntClaimHandler = defineGameHandler(
  'submit-manhunt-claim',
  async ({ game, eventData, eventTarget, io, redis, socket }) => {
    const challenge = currentManhunt(game)
    if (!challenge || challenge.state.finished) return
    // Only for the beat the detective saw — a retried send can't land on the
    // next beat. applyManhuntClaim owns every other rule.
    if (eventData.turn !== challenge.state.turn) return
    if (!isValidISOCode(eventData.isoCode)) return

    await applyManhuntClaim(
      { io, redis, socket, eventTarget },
      game,
      challenge,
      eventTarget.playerId,
      eventData.isoCode
    )
  }
)
