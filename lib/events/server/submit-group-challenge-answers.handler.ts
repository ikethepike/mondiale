import {
  getCorrectRanking,
  getIndividualChallenge,
  scoreChallengeSubmission,
} from '~~/lib/challenges'
import { getFinalChallenges } from '~~/lib/challenges/final-challenge'
import type { EventHandler } from '~~/server/middleware/socket.server'
import {
  individualChallengeAccessors,
  isValidIndividualChallengeAccessorId,
} from '~~/types/challenges/individual-challenge.type'
import type { PlayerMove } from '~~/types/game.types'
import { useServerSideEvents } from '../server-side'

export const submitGroupChallengeAnswersHandler: EventHandler = async ({
  io,
  eventData,
  eventTarget,
  redis,
  socket,
}) => {
  if (eventData.event !== 'submit-group-challenge-answers') return

  const server = useServerSideEvents({ socket, redis, io })

  const { gameId, playerId } = eventTarget
  const game = await server.fetchGame(gameId)
  if (!game) throw new ReferenceError(`Unable to find game: ${gameId}`)

  const { length } = game.rounds
  const currentRound = game.rounds[length - 1]
  if (!currentRound) throw new ReferenceError(`Unable to find round by index: ${length - 1}`)

  const originalRanking = currentRound.groupChallenge.countriesPerPlayer[playerId]
  if (!originalRanking)
    throw new ReferenceError(`Unable to retrieve original order for player: ${playerId}`)

  // ! Todo, fix to allow identical values
  const correctRanking = getCorrectRanking({
    groupChallengeAccessorId: currentRound.groupChallenge.id,
    isoCodes: originalRanking,
  })

  game.rounds[length - 1].groupAnswers[playerId] = {
    submitted: eventData.ranking,
    correct: correctRanking,
  }

  const scoring = scoreChallengeSubmission({
    groupChallengeAccessorId: currentRound.groupChallenge.id,
    submittedRanking: eventData.ranking,
  })

  game.rounds[length - 1].playerTurns[playerId] = { points: scoring }

  // Take current position + scoring, split on each challenge
  const player = game.players[playerId]
  if (!player) {
    console.error('Could not find player position value')
    throw new ReferenceError(`Unable to find position value for player: ${playerId}`)
  }

  const potentialProgress = player.currentPosition + scoring.scored
  const potentialTiles = [...game.tiles.slice(player.currentPosition, potentialProgress)]

  // Here, we add player moves. Each of these will be executed sequentially and players
  // will move an according amount of steps
  const moves: PlayerMove[] = []
  while (potentialTiles.length) {
    console.log(`Moveset: ${moves.length + 1}`)
    // Identify any special tiles in the moveset
    const specialTileIndex = potentialTiles.findIndex(tile =>
      [...individualChallengeAccessors, 'final'].includes(tile.type)
    )
    const specialTile = potentialTiles[specialTileIndex]

    const spliceCount = specialTileIndex === -1 ? potentialTiles.length : specialTileIndex
    const moveset = potentialTiles.splice(0, spliceCount + 1)
    console.log({ spliceCount, moveset, potentialTiles })
    let move: PlayerMove = {
      endTile: moveset[moveset.length - 1],
      steps: moveset.length,
    }

    switch (true) {
      // If player has reached final challenge
      case moveset.some(tile => tile.type === 'final'):
        console.log('> Final challenge', { specialTile, specialTileIndex })

        move = {
          endTile: specialTile,
          steps: moveset.length, // Stop one tile before
          challenge: getFinalChallenges({ game }),
        }
        break
      // If we have an individual challenge in our moveset
      case isValidIndividualChallengeAccessorId(specialTile?.type):
        {
          console.log('> Individual challenge', {
            specialTile,
            specialTileIndex,
          })
          const { type: accessorId } = specialTile
          if (!isValidIndividualChallengeAccessorId(accessorId)) {
            throw new EvalError(`Invalid accessor id for challenge: ${accessorId}`)
          }

          move = {
            endTile: specialTile,
            steps: specialTileIndex,
            challenge: getIndividualChallenge({ accessorId }),
          }
        }
        break
    }

    moves.push(move)
  }

  game.players[playerId].phase = 'group-scores'
  game.players[playerId].moves = moves

  await server.updateGameState(game)
  server.emit({ event: 'group-challenge-scored', game }, eventTarget)
}
