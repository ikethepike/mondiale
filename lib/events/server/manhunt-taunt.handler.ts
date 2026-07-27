import { v4 as uuidv4 } from 'uuid'
import { MANHUNT_TAUNTS } from '~~/lib/manhunt'
import type { EventHandler } from '~~/server/middleware/socket.server'
import { useServerSideEvents } from '../server-side'
import { currentManhunt } from './manhunt-beats'
import { createTokenBucket } from './rate-limit'

// Stingier than cheers even — a taunt is a delicacy, not a chat channel.
const tauntBucket = createTokenBucket(2, 0.15)

/** Called from the socket's `disconnect` so the map can't grow unbounded. */
export const forgetTauntBucket = (socketId: string) => tauntBucket.forget(socketId)

/**
 * Ephemeral taunt relay between the despot and the hunt. Writes NO permanent
 * state (the cheer-relay discipline): the role comes from the round, never
 * the payload, and only an index into MANHUNT_TAUNTS travels — free text
 * from a client is never echoed to the room.
 */
export const manhuntTauntHandler: EventHandler = async ({
  io,
  eventData,
  eventTarget,
  redis,
  socket,
}) => {
  if (eventData.event !== 'manhunt-taunt') return
  if (!tauntBucket.take(socket.id, Date.now())) return

  const server = useServerSideEvents({ socket, redis, io })
  const game = await server.fetchGame(eventTarget.gameId)
  if (!game) return
  const challenge = currentManhunt(game)
  if (!challenge || challenge.state.finished) return
  // The briefing is a reading room, not a stage.
  if (challenge.state.briefing) return

  const role =
    eventTarget.playerId === challenge.despotId
      ? ('despot' as const)
      : challenge.state.detectives.includes(eventTarget.playerId)
        ? ('detective' as const)
        : undefined
  if (!role) return

  const lines = MANHUNT_TAUNTS[role]
  if (!Number.isInteger(eventData.index) || eventData.index < 0 || eventData.index >= lines.length) {
    return
  }

  server.emit(
    {
      event: 'manhunt-taunt',
      playerId: eventTarget.playerId,
      role,
      index: eventData.index,
      entryId: uuidv4(),
      at: Date.now(),
    },
    eventTarget
  )
}
