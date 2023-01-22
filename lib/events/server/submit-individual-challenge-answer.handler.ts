import { wait } from '~~/lib/time'
import { EventHandler } from '~~/server/middleware/socket.server'
import { useServerSideEvents } from '../server-side'
import { enterMovementPhaseHandler } from './enter-movement-phase.handler'

export const submitIndividualChallengeAnswersHandler: EventHandler = async ({
  io,
  eventData,
  eventTarget,
  redis,
  socket,
}) => {
  if (eventData.event !== 'submit-individual-challenge-answer') return

  const server = useServerSideEvents({ socket, redis, io })

  const { gameId, playerId } = eventTarget
  const game = await server.fetchGame(gameId)
  if (!game) throw new ReferenceError(`Unable to find game: ${gameId}`)

  const playerPosition = game.position[playerId]
  if (!playerPosition) {
    return console.warn(`Unable to find player position: ${playerId}`)
  }

  const currentMove = playerPosition.moves[0]
  if (!currentMove) {
    return console.warn(`Unable to retrieve current challenge`)
  }

  if (currentMove.challenge?._type === 'final-challenge') {
    return console.error(`Final challenge submitted as individual challenge`)
  }

  // Answer was correct
  if (eventData.isoCode === currentMove.challenge?.country) {
    game.position[playerId].currentPosition += 2
    game.position[playerId].moves.shift()
  } else {
    game.position[playerId].moves = []
  }

  await server.updateGameState(game)
  server.emit({ event: 'individual-challenge-checked', game }, eventTarget)
  await wait(5000)

  enterMovementPhaseHandler({
    io,
    redis,
    socket,
    eventTarget,
    eventKey: 'enter-movement-phase',
    eventData: { event: 'enter-movement-phase' },
  })
}
