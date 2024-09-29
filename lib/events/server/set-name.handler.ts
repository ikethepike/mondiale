import type { EventHandler } from '~~/server/middleware/socket.server'
import { useServerSideEvents } from '../server-side'

export const setNameHandler: EventHandler = async ({
  io,
  eventData,
  eventTarget,
  redis,
  socket,
}) => {
  if (eventData.event !== 'set-name') return

  const server = useServerSideEvents({ socket, redis, io })

  const { gameId, playerId } = eventTarget
  const game = await server.fetchGame(gameId)
  if (!game) throw new ReferenceError(`Unable to find game: ${gameId}`)

  if (!game.players[playerId]) throw new ReferenceError(`Unable to find with id: ${playerId}`)

  game.players[playerId].ready = true
  game.players[playerId].name = eventData.name
  game.players[playerId].phase = 'waiting-for-game'

  await server.updateGameState(game)

  server.emit({ event: 'name-set', game }, eventTarget)
}
