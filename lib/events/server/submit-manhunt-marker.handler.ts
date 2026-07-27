import { isValidISOCode } from '~~/types/geography.types'
import { defineGameHandler } from '../server-side'
import { applyManhuntMarker, currentManhunt } from './manhunt-beats'

export const submitManhuntMarkerHandler = defineGameHandler(
  'submit-manhunt-marker',
  async ({ game, eventData, eventTarget, io, redis, socket }) => {
    const challenge = currentManhunt(game)
    if (!challenge || challenge.state.finished) return
    const { state } = challenge

    // Detectives only, on a hunt beat, for the beat they saw. The despot
    // holds no marker, and a retried send can't land twice — applyManhuntMarker
    // also ignores anyone already committed.
    if (!state.detectives.includes(eventTarget.playerId)) return
    if (state.beat !== 'hunt') return
    if (eventData.turn !== state.turn) return
    if (!isValidISOCode(eventData.isoCode)) return

    await applyManhuntMarker(
      { io, redis, socket, eventTarget },
      game,
      challenge,
      eventTarget.playerId,
      eventData.isoCode
    )
  }
)
