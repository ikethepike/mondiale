import { PLAYER_COLORS } from '~~/data/palette'
import { shuffleArray } from '~~/lib/arrays'
import type { EventHandler } from '~~/server/middleware/socket.server'
import { useServerSideEvents } from '../server-side'

export const setColorHandler: EventHandler = async ({
  io,
  eventData,
  eventTarget,
  redis,
  socket,
}) => {
  if (eventData.event !== 'set-color') return
  const server = useServerSideEvents({ socket, redis, io })

  const { gameId, playerId } = eventTarget
  const game = await server.fetchGame(gameId)
  if (!game) throw new ReferenceError(`Unable to find game: ${gameId}`)

  if (!game.players[playerId]) throw new ReferenceError(`Unable to find with id: ${playerId}`)
  const playerColors = Object.values(game.players).flatMap(player => player.color)

  // Pick a unique, random color
  const colors = shuffleArray(
    PLAYER_COLORS.filter(color => {
      return !playerColors.includes(color)
    })
  )

  game.players[playerId].color = colors[0]
  await server.updateGameState(game)

  server.emit({ event: 'color-set', game }, eventTarget)
}
