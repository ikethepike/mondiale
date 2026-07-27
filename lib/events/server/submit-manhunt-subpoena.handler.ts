import { isManhuntSubpoenaTopic } from '~~/lib/manhunt'
import { defineGameHandler } from '../server-side'
import { applyManhuntSubpoena, currentManhunt } from './manhunt-beats'

export const submitManhuntSubpoenaHandler = defineGameHandler(
  'submit-manhunt-subpoena',
  async ({ game, eventData, eventTarget, io, redis, socket }) => {
    const challenge = currentManhunt(game)
    if (!challenge || challenge.state.finished) return
    const { state } = challenge

    // Detectives only, on a hunt beat, for the beat they saw, with a real
    // topic. Token accounting (and the retried-send guard it implies) lives
    // in applyManhuntSubpoena.
    if (!state.detectives.includes(eventTarget.playerId)) return
    if (state.beat !== 'hunt') return
    if (eventData.turn !== state.turn) return
    if (!isManhuntSubpoenaTopic(eventData.topic)) return

    await applyManhuntSubpoena(
      { io, redis, socket, eventTarget },
      game,
      challenge,
      eventTarget.playerId,
      eventData.topic
    )
  }
)
