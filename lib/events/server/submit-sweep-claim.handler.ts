import { isValidISOCode } from '~~/types/geography.types'
import { defineGameHandler } from '../server-side'
import { applySweepClaim, currentCleanSweep } from './sweep-beats'

/**
 * A claim off the shared board. The claimant is `eventTarget.playerId` — the
 * socket's AUTHENTICATED id, never a payload field — so no client can claim a
 * slot in a rival's name.
 */
export const submitSweepClaimHandler = defineGameHandler(
  'submit-sweep-claim',
  async ({ game, eventData, eventTarget, io, redis, socket }) => {
    const challenge = currentCleanSweep(game)
    if (!challenge || challenge.state.finished) return
    if (!isValidISOCode(eventData.isoCode)) return

    await applySweepClaim(
      { io, redis, socket, eventTarget },
      game,
      challenge,
      eventTarget.playerId,
      eventData.isoCode
    )
  }
)
