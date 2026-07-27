import { manhuntKey, type ManhuntSecret } from '~~/lib/manhunt'
import { defineGameHandler } from '../server-side'
import { currentManhunt } from './manhunt-beats'

/**
 * The despot's reconnect path: their client re-asks for its own trail after a
 * reload or a socket rebind. Answered on the REQUESTING socket only — the
 * dispatch layer already proved this socket is bound to the playerId it
 * claims, so gating on despotId is gating on the socket itself.
 */
export const fetchManhuntPositionHandler = defineGameHandler(
  'fetch-manhunt-position',
  async ({ game, eventTarget, redis, socket }) => {
    const challenge = currentManhunt(game)
    if (!challenge) return
    if (eventTarget.playerId !== challenge.despotId) return

    const secret = await redis.get<ManhuntSecret>(manhuntKey(game.id, game.rounds.length - 1))
    if (!secret) return

    socket.emit(
      'manhunt-position',
      { event: 'manhunt-position', trail: secret.trail, turn: challenge.state.turn },
      eventTarget
    )
  }
)
