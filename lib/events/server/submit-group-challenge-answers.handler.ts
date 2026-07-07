import {
  getCorrectRanking,
  getIndividualChallenge,
  scoreChallengeSubmission,
  scoreTraversalSubmission,
} from '~~/lib/challenges'
import { getFinalChallenges } from '~~/lib/challenges/final-challenge'
import {
  individualChallengeAccessors,
  isValidIndividualChallengeAccessorId,
} from '~~/types/challenges/individual-challenge.type'
import { isTraversalChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { PlayerMove } from '~~/types/game.types'
import { defineGameHandler } from '../server-side'

export const submitGroupChallengeAnswersHandler = defineGameHandler(
  'submit-group-challenge-answers',
  async ({ game, player, server, eventData, eventTarget }) => {
    const { playerId } = eventTarget
    const { length } = game.rounds
    const currentRound = game.rounds[length - 1]
    if (!currentRound) throw new ReferenceError(`Unable to find round by index: ${length - 1}`)

    // The submitted ISO list is either a ranking or a traversal route,
    // depending on the round's challenge type
    let scoring: { scored: number; maximum: number }
    if (isTraversalChallenge(currentRound.groupChallenge)) {
      const challenge = currentRound.groupChallenge

      game.rounds[length - 1].groupAnswers[playerId] = {
        submitted: eventData.ranking,
        correct: challenge.optimalPath,
      }

      scoring = scoreTraversalSubmission({ challenge, submittedGuesses: eventData.ranking })
    } else {
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

      scoring = scoreChallengeSubmission({
        groupChallengeAccessorId: currentRound.groupChallenge.id,
        submittedRanking: eventData.ranking,
      })
    }

    game.rounds[length - 1].playerTurns[playerId] = { points: scoring }

    // Take current position + scoring, split on each challenge
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

    player.phase = 'group-scores'
    player.moves = moves

    await server.updateGameState(game)
    server.emit({ event: 'group-challenge-scored', game }, eventTarget)
  }
)
