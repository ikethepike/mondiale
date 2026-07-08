import type { EventHandler } from '~~/server/middleware/socket.server'
import { useServerSideEvents } from '../server-side'

/**
 * Ephemeral live-guess relay for group rounds (Flag Palette, Capital Guess).
 * Broadcasts a player's current pick to the room so everyone sees opponents'
 * guesses land in real time. Writes NO permanent game state (mirrors
 * update-by-index). Re-broadcasts with `eventTarget.playerId` — the socket's
 * AUTHENTICATED id (Fix #1) — never a playerId from the payload body, so a
 * client can't spoof another player's guess.
 */
export const playerGuessingHandler: EventHandler = async ({
  io,
  eventData,
  eventTarget,
  redis,
  socket,
}) => {
  if (eventData.event !== 'player-guessing') return

  const server = useServerSideEvents({ socket, redis, io })
  server.emit(
    { event: 'player-guessing', playerId: eventTarget.playerId, isoCode: eventData.isoCode },
    eventTarget
  )
}
