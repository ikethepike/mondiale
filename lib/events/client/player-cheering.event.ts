import { CHEER_EMOJIS } from '~~/types/events.types'
import type { ClientSideEventHandler } from '~~/plugins/socket.client'

/** Bounds the list between prune ticks, so a burst can't grow the scene. */
const MAX_ENTRIES = 16
const TTL_MS = 5000

/**
 * An emoji cheer arrived — append it to the ephemeral board list so the 3D
 * scene (and the cheered player's toast) can play it. Unlike live guesses the
 * self-echo is kept: the sender sees their own cheer land through the same
 * broadcast path as everyone else.
 */
export const playerCheeringEvent: ClientSideEventHandler = ({ payload, gameStore }) => {
  if (payload.event !== 'player-cheering') return
  // Server already whitelists; re-check so a spoofed payload never renders
  if (!CHEER_EMOJIS.includes(payload.emoji)) return

  const next = [
    ...gameStore.board.cheers.filter(cheer => cheer.at > Date.now() - TTL_MS),
    {
      entryId: payload.entryId,
      playerId: payload.playerId,
      targetPlayerId: payload.targetPlayerId,
      emoji: payload.emoji,
      at: payload.at,
    },
  ]
  gameStore.board.cheers = next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
}
