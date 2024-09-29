import { getGroupChallenge } from '~~/lib/challenges'
import type { EventHandler } from '~~/server/middleware/socket.server'
import { useServerSideEvents } from '../server-side'

export const readyForRoundHandler: EventHandler = async ({
  io,
  eventData,
  eventTarget,
  redis,
  socket,
}) => {
  if (eventData.event !== 'ready-for-round') return

  const server = useServerSideEvents({ socket, redis, io })

  const { gameId, playerId } = eventTarget
  const game = await server.fetchGame(gameId)
  if (!game) throw new ReferenceError(`Unable to find game: ${gameId}`)

  const player = game.players[playerId]
  if (!player) throw new ReferenceError(`Unable to find player position: ${playerId}`)
  const lastMove = player.moves.shift()
  if (lastMove) {
    game.players[playerId].currentPosition += lastMove.steps
  }

  game.players[playerId].moves = []

  // Create a new round if there are no turns remaining
  if (Object.values(game.players).every(({ moves }) => moves.length === 0)) {
    game.rounds.push({
      groupChallenge: getGroupChallenge({ game }),
      groupAnswers: {},
      playerTurns: {},
    })

    await server.updateGameState(game)
    server.emit({ event: 'new-round', game }, eventTarget)
  } else {
    await server.updateGameState(game)
    server.emit({ event: 'player-ready-for-round', game }, eventTarget)
  }
}
