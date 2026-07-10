import { v4 as uuidv4 } from 'uuid'
import { CHEER_EMOJIS } from '~~/types/events.types'
import type { EventHandler } from '~~/server/middleware/socket.server'
import { createTokenBucket } from './rate-limit'
import { useServerSideEvents } from '../server-side'

// Stingier than guesses — cheers are garnish, not gameplay.
const cheerBucket = createTokenBucket(3, 0.5)

/** Called from the socket's `disconnect` so the map can't grow unbounded. */
export const forgetCheerBucket = (socketId: string) => cheerBucket.forget(socketId)

/**
 * Ephemeral emoji-cheer relay: floats an emoji over the target's pawn on every
 * client. Writes NO permanent game state (mirrors player-guessing).
 *
 * Re-broadcasts with `eventTarget.playerId` — the socket's AUTHENTICATED id —
 * and whitelists the emoji against CHEER_EMOJIS so an arbitrary client string
 * is never echoed to the room. The rate limit runs before the game fetch: a
 * dropped event must not hold the per-game promise chain.
 */
export const playerCheeringHandler: EventHandler = async ({
  io,
  eventData,
  eventTarget,
  redis,
  socket,
}) => {
  if (eventData.event !== 'player-cheering') return
  if (!cheerBucket.take(socket.id, Date.now())) return
  if (!CHEER_EMOJIS.includes(eventData.emoji)) return

  const server = useServerSideEvents({ socket, redis, io })
  const game = await server.fetchGame(eventTarget.gameId)
  if (!game) return
  if (!game.players[eventData.targetPlayerId]) return

  server.emit(
    {
      event: 'player-cheering',
      playerId: eventTarget.playerId,
      targetPlayerId: eventData.targetPlayerId,
      emoji: eventData.emoji,
      entryId: uuidv4(),
      at: Date.now(),
    },
    eventTarget
  )
}
