import {
  getCorrectRanking,
  getIndividualChallenge,
  scoreChallengeSubmission,
} from '~~/lib/challenges'
import { getFinalChallenges } from '~~/lib/challenges/final-challenge'
import { EventHandler } from '~~/server/middleware/socket.server'
import { isValidIndividualChallengeAccessorId } from '~~/types/challenges/individual-challenge.type'
import { PlayerMove } from '~~/types/game.types'
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
  const position = game.position[playerId]
  if (!position) {
    console.error('Could not find player position value')
    throw new ReferenceError(`Unable to find position value for player: ${playerId}`)
  }

  const potentialProgress = position.currentPosition + scoring.scored
  const potentialTiles = [...game.tiles.slice(position.currentPosition, potentialProgress)]

  const moves: PlayerMove[] = []
  while (potentialTiles.length) {
    let index: number | undefined = potentialTiles
      .slice(1) // In case, you landed on a challenge tile
      .findIndex(tile => !['normal', 'start', 'finish'].includes(tile.type))

    if (index === -1) {
      index = potentialTiles.length
      moves.push({
        steps: potentialTiles.length,
      })
    } else {
      index++ // to account for the slice offset
      const { type } = potentialTiles[index]
      if (type === 'final') {
        moves.push({
          steps: index,
          challenge: getFinalChallenges({ game }),
        })
      } else {
        if (!isValidIndividualChallengeAccessorId(type)) {
          throw new EvalError(`Invalid accessor id for challenge: ${type}`)
        }

        moves.push({
          steps: index,
          challenge: getIndividualChallenge({ accessorId: type }),
        })
      }
    }

    potentialTiles.splice(0, index + 1)
  }

  game.players[playerId].phase = 'group-scores'
  game.position[playerId].moves = moves

  await server.updateGameState(game)
  server.emit({ event: 'group-challenge-scored', game }, eventTarget)
}
