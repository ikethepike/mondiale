import { wait } from '~~/lib/time'
import type { EventHandler } from '~~/server/middleware/socket.server'
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

  const player = game.players[playerId]
  if (!player) {
    return console.warn(`Unable to find player position: ${playerId}`)
  }

  const currentMove = player.moves[0]
  if (!currentMove) {
    return console.warn(`Unable to retrieve current challenge`)
  }

  if (currentMove.challenge?._type === 'final-challenge') {
    return console.error(`Final challenge submitted as individual challenge`)
  }

  // Answer was correct
  if (eventData.isoCode === currentMove.challenge?.country) {
    game.players[playerId].currentPosition += 2
    game.players[playerId].moves.shift()
  } else {
    game.players[playerId].moves = []
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
