import { isValidISOCode } from '~~/types/geography.types'
import { defineGameHandler } from '../server-side'
import { applyManhuntMove, currentManhunt } from './manhunt-beats'

export const submitManhuntMoveHandler = defineGameHandler(
  'submit-manhunt-move',
  async ({ game, eventData, eventTarget, io, redis, socket }) => {
    const challenge = currentManhunt(game)
    if (!challenge || challenge.state.finished) return
    const { state } = challenge

    // Only the despot moves, only on a move beat, and only for the beat they
    // saw — a retried critical event must die here, not land as a second hop.
    if (eventTarget.playerId !== challenge.despotId) return
    if (state.beat !== 'move') return
    if (eventData.turn !== state.turn) return
    if (!isValidISOCode(eventData.isoCode)) return

    await applyManhuntMove({ io, redis, socket, eventTarget }, game, challenge, eventData.isoCode)
  }
)
