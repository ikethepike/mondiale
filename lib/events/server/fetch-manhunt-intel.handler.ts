import { defineGameHandler } from '../server-side'
import {
  currentManhunt,
  fetchManhuntSecret,
  manhuntPositionPayload,
  manhuntSonarPayload,
} from './manhunt-beats'

/**
 * The reconnect path for a seat's private intel: the despot re-asks for its
 * trail and plan, a detective for its own sonar readings. Answered on the
 * REQUESTING socket only — the dispatch layer already proved this socket is
 * bound to the playerId it claims, so gating on the role is gating on the
 * socket itself.
 */
export const fetchManhuntIntelHandler = defineGameHandler(
  'fetch-manhunt-intel',
  async ({ game, eventTarget, redis, socket }) => {
    const challenge = currentManhunt(game)
    if (!challenge) return
    const { playerId } = eventTarget
    const isDespot = playerId === challenge.despotId
    if (!isDespot && !challenge.state.detectives.includes(playerId)) return

    const secret = await fetchManhuntSecret(redis, game.id, game.rounds.length - 1)
    if (!secret) return

    const { turn } = challenge.state
    if (isDespot) {
      socket.emit('manhunt-position', manhuntPositionPayload(secret, turn), eventTarget)
    } else {
      socket.emit('manhunt-sonar', manhuntSonarPayload(secret, playerId, turn), eventTarget)
    }
  }
)
