import {
  clampClientScore,
  getCorrectRanking,
  getIndividualChallenge,
  scoreChallengeSubmission,
  scoreHotCold,
  scoreNeighbourBlitz,
  scoreTraversalSubmission,
  scoreWaterBlitz,
} from '~~/lib/challenges'
import { getFinalChallenges } from '~~/lib/challenges/final-challenge'
import {
  individualChallengeAccessors,
  isValidIndividualChallengeAccessorId,
} from '~~/types/challenges/individual-challenge.type'
import { roundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import type { GroupChallengeAnswer, PlayerMove } from '~~/types/game.types'
import { defineGameHandler } from '../server-side'

export const submitGroupChallengeAnswersHandler = defineGameHandler(
  'submit-group-challenge-answers',
  async ({ game, player, server, eventData, eventTarget }) => {
    const { playerId } = eventTarget
    const { length } = game.rounds
    const currentRound = game.rounds[length - 1]
    if (!currentRound) throw new ReferenceError(`Unable to find round by index: ${length - 1}`)

    // A repeat submission (double-click, reconnect replay) would re-score the
    // round and rebuild the player's moves — possibly mid-walk
    if (currentRound.groupAnswers[playerId]) {
      return console.warn(`Duplicate round submission ignored for player: ${playerId}`)
    }

    // The submitted ISO list means different things per round kind: a
    // ranking, a traversal guess set, named neighbours, a probe trail…
    const roundChallenge = currentRound.groupChallenge
    const kind = roundChallengeKind(roundChallenge)
    let scoring: { scored: number; maximum: number }
    let answer: GroupChallengeAnswer

    switch (kind) {
      case 'traversal': {
        if (roundChallenge._type !== 'traversal-challenge') throw new TypeError('kind mismatch')
        answer = { submitted: eventData.ranking, correct: roundChallenge.optimalPath }
        scoring = scoreTraversalSubmission({
          challenge: roundChallenge,
          submittedGuesses: eventData.ranking,
        })
        break
      }
      case 'neighbour-blitz': {
        if (roundChallenge._type !== 'neighbour-blitz-challenge') {
          throw new TypeError('kind mismatch')
        }
        answer = { submitted: eventData.ranking, correct: roundChallenge.neighbours }
        scoring = scoreNeighbourBlitz({
          challenge: roundChallenge,
          submittedGuesses: eventData.ranking,
        })
        break
      }
      case 'hot-cold': {
        if (roundChallenge._type !== 'hot-cold-challenge') throw new TypeError('kind mismatch')
        answer = { submitted: eventData.ranking, correct: [roundChallenge.country] }
        scoring = scoreHotCold({
          challenge: roundChallenge,
          submittedGuesses: eventData.ranking,
        })
        break
      }
      case 'silhouette': {
        if (roundChallenge._type !== 'silhouette-challenge') throw new TypeError('kind mismatch')
        const correct = eventData.ranking[0] === roundChallenge.country
        answer = { submitted: eventData.ranking, correct: [roundChallenge.country] }
        scoring = clampClientScore(eventData.clientScore, roundChallenge.maximumPoints, correct)
        break
      }
      case 'stat-detective': {
        if (roundChallenge._type !== 'stat-detective-challenge') {
          throw new TypeError('kind mismatch')
        }
        const correct = eventData.ranking[0] === roundChallenge.country
        answer = { submitted: eventData.ranking, correct: [roundChallenge.country] }
        scoring = clampClientScore(eventData.clientScore, roundChallenge.maximumPoints, correct)
        break
      }
      case 'two-truths': {
        if (roundChallenge._type !== 'two-truths-challenge') throw new TypeError('kind mismatch')
        // Spotting the lie is all-or-nothing; the client reports the pick as
        // the mystery country when the lie was found
        const correct = eventData.ranking[0] === roundChallenge.country
        answer = { submitted: eventData.ranking, correct: [roundChallenge.country] }
        scoring = clampClientScore(eventData.clientScore, roundChallenge.maximumPoints, correct)
        break
      }
      case 'river-run':
      case 'shared-shores':
      case 'highlands': {
        if (roundChallenge._type !== 'water-blitz-challenge') throw new TypeError('kind mismatch')
        answer = { submitted: eventData.ranking, correct: roundChallenge.countries }
        scoring = scoreWaterBlitz({
          challenge: roundChallenge,
          submittedGuesses: eventData.ranking,
        })
        break
      }
      case 'name-that-water': {
        if (roundChallenge._type !== 'name-water-challenge') throw new TypeError('kind mismatch')
        // The guessed NAME is validated client-side (it isn't an ISO code);
        // the scorecard shows the feature's shore countries as the answer
        answer = { submitted: eventData.ranking, correct: roundChallenge.countries }
        scoring = clampClientScore(
          eventData.clientScore,
          roundChallenge.maximumPoints,
          (eventData.clientScore ?? 0) > 0
        )
        break
      }
      case 'sketch': {
        if (roundChallenge._type !== 'sketch-challenge') throw new TypeError('kind mismatch')
        answer = {
          submitted: [roundChallenge.country],
          correct: [roundChallenge.country],
          sketch: eventData.sketch,
        }
        // Sketches always "count" — the client-computed similarity IS the score
        scoring = clampClientScore(eventData.clientScore, roundChallenge.maximumPoints, true)
        break
      }
      default: {
        if (!('countriesPerPlayer' in roundChallenge)) throw new TypeError('kind mismatch')
        const originalRanking = roundChallenge.countriesPerPlayer[playerId]
        if (!originalRanking)
          throw new ReferenceError(`Unable to retrieve original order for player: ${playerId}`)

        // ! Todo, fix to allow identical values
        const correctRanking = getCorrectRanking({
          groupChallengeAccessorId: roundChallenge.id,
          isoCodes: originalRanking,
        })

        answer = { submitted: eventData.ranking, correct: correctRanking }
        scoring = scoreChallengeSubmission({
          groupChallengeAccessorId: roundChallenge.id,
          submittedRanking: eventData.ranking,
        })
      }
    }

    game.rounds[length - 1].groupAnswers[playerId] = answer

    // Test hook: FORCE_FINAL_CHALLENGE=1 teleports every player next to the
    // final tile after this round, so its gauntlet starts within seconds
    if (typeof process !== 'undefined' && process.env?.FORCE_FINAL_CHALLENGE === '1') {
      const finalTile = game.tiles[game.tiles.length - 1]
      game.rounds[length - 1].playerTurns[playerId] = { points: scoring }
      player.phase = 'group-scores'
      player.currentPosition = finalTile.position - 1
      player.moves = [
        {
          endTile: finalTile,
          steps: 2,
          challenge: getFinalChallenges({ game }),
        },
      ]
      await server.updateGameState(game)
      server.emit({ event: 'group-challenge-scored', game }, eventTarget)
      return
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
              challenge: getIndividualChallenge({
                accessorId,
                difficulty: game.difficulty,
                variant: game.variant,
              }),
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
