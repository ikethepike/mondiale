import { EventHandler } from '~~/server/middleware/socket.server'
import { useServerSideEvents } from '../server-side'

export const closeTutorialHandler: EventHandler = async ({
  io,
  eventData,
  eventTarget,
  redis,
  socket,
}) => {
  if (eventData.event !== 'close-tutorial') return

  const server = useServerSideEvents({ socket, redis, io })

  const { gameId, playerId } = eventTarget
  const game = await server.fetchGame(gameId)
  if (!game) throw new ReferenceError(`Unable to find game: ${gameId}`)
  if (!game.players[playerId]) throw new ReferenceError(`Unable to find with id: ${playerId}`)

  game.players[playerId].phase = 'group-challenge'

  await server.updateGameState(game)
  server.emit({ event: 'update', game }, eventTarget)
}
