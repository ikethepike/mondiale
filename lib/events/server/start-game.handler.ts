import { getGroupChallenge } from '~~/lib/challenges'
import { EventHandler } from '~~/server/middleware/socket.server'
import { useServerSideEvents } from '../server-side'

export const startGameHandler: EventHandler = async ({
  io,
  eventData,
  eventTarget,
  redis,
  socket,
}) => {
  if (eventData.event !== 'start-game') return

  const server = useServerSideEvents({ socket, redis, io })

  const { gameId } = eventTarget
  const game = await server.fetchGame(gameId)
  if (!game) throw new ReferenceError(`Unable to find game: ${gameId}`)
  if (game.started) return server.emit({ event: 'update', game }, eventTarget)

  // Start the game
  game.started = true

  for (const playerId of Object.keys(game.players)) {
    game.players[playerId].phase = 'tutorial'
  }

  // Generate a new round
  game.rounds.push({
    groupChallenge: getGroupChallenge({ game }),
    groupAnswers: {},
    playerTurns: {},
  })

  await server.updateGameState(game)
  server.emit({ event: 'game-started', game }, eventTarget)
}
