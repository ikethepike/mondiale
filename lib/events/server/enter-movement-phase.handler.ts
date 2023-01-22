import { getGroupChallenge } from '~~/lib/challenges'
import { wait } from '~~/lib/time'
import { EventHandler } from '~~/server/middleware/socket.server'
import { useServerSideEvents } from '../server-side'

export const enterMovementPhaseHandler: EventHandler = async ({
  io,
  eventData,
  eventTarget,
  redis,
  socket,
}) => {
  if (eventData.event !== 'enter-movement-phase') return

  const server = useServerSideEvents({ socket, redis, io })

  const { gameId, playerId } = eventTarget
  const game = await server.fetchGame(gameId)
  if (!game) throw new ReferenceError(`Unable to find game: ${gameId}`)
  if (!game.players[playerId]) throw new ReferenceError(`Unable to find with id: ${playerId}`)

  // Defer movement logic to the server
  // Find all moves that we currently can do, move up player to the point and check tile
  const playerPosition = game.position[playerId]
  if (!playerPosition) throw new ReferenceError('Unable to find player position')

  // Player has completed their moves and is ready to see their result from the individual challenge

  const move = playerPosition.moves[0]
  if (move) {
    game.players[playerId].phase = 'moving'

    for (const index of [...Array(move.steps).keys()]) {
      const isLastStep = index + 1 === move.steps

      await wait(500)
      if (isLastStep && move.challenge) {
        game.players[playerId].phase = move.challenge._type
      } else if (isLastStep) {
        // player has no additional steps and the turn has not ended
        game.players[playerId].phase = 'movement-summary'
      } else {
        game.position[playerId].currentPosition++
      }
      server.emit({ event: 'update', game }, eventTarget)
    }
  } else {
    game.players[playerId].phase = 'movement-summary'
    await server.updateGameState(game)
    server.emit({ event: 'update', game }, eventTarget)
  }

  const readyForNextTurn = Object.values(game.players).every(
    player => player.phase === 'movement-summary'
  )

  if (readyForNextTurn) {
    game.rounds.push({
      groupChallenge: getGroupChallenge({ game }),
      groupAnswers: {},
      playerTurns: {},
    })

    await wait(2000)

    for (const playerId of Object.keys(game.players)) {
      game.players[playerId].phase = 'group-challenge'
    }

    await server.updateGameState(game)
    server.emit({ event: 'new-round', game }, eventTarget)
  } else {
    await server.updateGameState(game)
  }
}
