import { generateTiles } from '~~/lib/tiles'
import { EventHandler } from '~~/server/middleware/socket.server'
import { createPlayer } from '../../../lib/player'

import { useServerSideEvents } from '../server-side'

export const joinEventHandler: EventHandler = async ({
  io,
  redis,
  socket,
  eventData,
  eventTarget,
}) => {
  if (eventData.event !== 'join') return
  console.log({ playerId: eventTarget.playerId })

  const server = useServerSideEvents({ socket, redis, io })

  const { gameId, playerId } = eventTarget
  let game = await server.fetchGame(gameId)

  // Game does not exist, we have to create it
  if (!game) {
    const { variant } = eventData
    console.log(`Creating room: ${gameId} - ${variant}`)
    game = {
      variant,
      id: gameId,
      rounds: [],
      players: {},
      position: {},
      started: false,
      host: playerId,
      length: 'medium',
      difficulty: 'normal',
      tiles: generateTiles('medium'),
    }

    game.players[playerId] = createPlayer(playerId)
    game.position[playerId] = {
      currentPosition: 0,
      moves: [],
      progress: [],
    }

    await server.updateGameState(game)
  }

  // Player connecting to existing game
  if (!game.players[playerId] && !game.started) {
    game.players[playerId] = createPlayer(playerId)
    game.position[playerId] = {
      currentPosition: 0,
      moves: [],
      progress: [],
    }
  }

  // Game already started
  if (!game.players[playerId] && game.started) {
    console.log('rejected!')
    await server.emit({ event: 'game-already-started', game }, eventTarget)
    socket.disconnect(true)
    return
  }

  // Safety logic for returning players
  const index = game.rounds.length - 1
  if (index !== -1) {
    console.log('There are rounds')
    const latestRound = game.rounds[index]
    if (
      game.players[playerId].phase === 'movement-summary' &&
      !latestRound.groupAnswers[playerId]
    ) {
      game.players[playerId].phase === 'group-challenge'
    }
  }

  await socket.join(gameId)
  await server.updateGameState(game)

  server.emit({ event: 'player-joined', game }, eventTarget)
}
