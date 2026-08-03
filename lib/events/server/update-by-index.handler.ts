import type { EventHandler } from '~~/server/middleware/socket.server'
import { useServerSideEvents } from '../server-side'

export const updateByIndexHandler: EventHandler = async ({
  io,
  eventData,
  eventTarget,
  redis,
  socket,
}) => {
  if (eventData.event !== 'update-by-index') return

  const server = useServerSideEvents({ socket, redis, io })

  // Relays broadcast into the room regardless of the SENDER's membership, and
  // a bound socket is not proof of a seat (kicked ids stay bound until they
  // disconnect; handshake 'open' verdicts bind ids that never joined). Only a
  // seated player may drive everyone's rendered game state.
  const game = await server.fetchGame(eventTarget.gameId)
  if (!game?.players[eventTarget.playerId]) return

  const { accessorPattern, value } = eventData
  console.log({ value })

  server.emit({ event: 'index-update', value, accessorPattern }, eventTarget)
}
