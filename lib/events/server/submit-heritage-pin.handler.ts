import { defineGameHandler } from '../server-side'
import { applyHeritagePin, currentHeritageHunt } from './heritage-beats'

export const submitHeritagePinHandler = defineGameHandler(
  'submit-heritage-pin',
  async ({ game, eventData, eventTarget, io, redis, socket }) => {
    const challenge = currentHeritageHunt(game)
    if (!challenge || challenge.state.finished || challenge.state.revealing) return
    // A retried critical event or stale client lands after the beat moved on.
    if (eventData.beat !== challenge.state.beat) return
    const { pin } = eventData
    if (typeof pin?.lat !== 'number' || typeof pin?.lng !== 'number') return

    await applyHeritagePin(
      { io, redis, socket, eventTarget },
      game,
      challenge,
      eventTarget.playerId,
      { lat: pin.lat, lng: pin.lng }
    )
  }
)
