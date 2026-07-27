import {
  clampClientScore,
  getCorrectRanking,
  isFlagPaletteMatch,
  scoreChallengeSubmission,
  scoreGhostState,
  scoreHotCold,
  scoreNoMansLand,
  scorePinLandmark,
  scoreTraversalSubmission,
  scoreTrendRace,
} from '~~/lib/challenges'
import { getFinalChallenges } from '~~/lib/challenges/final-challenge'
import { empirePots, scoreEmpireExtent } from '~~/lib/empires'
import { blitzScore } from '~~/lib/scoring'
import { roundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import type { GroupChallengeAnswer } from '~~/types/game.types'
import { defineGameHandler } from '../server-side'
import { movesForScoredPoints } from './moves'

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
        scoring = blitzScore(
          roundChallenge.neighbours,
          eventData.ranking,
          roundChallenge.maximumPoints
        )
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
        scoring = blitzScore(
          roundChallenge.countries,
          eventData.ranking,
          roundChallenge.maximumPoints
        )
        break
      }
      case 'mother-tongue': {
        if (roundChallenge._type !== 'mother-tongue-challenge') throw new TypeError('kind mismatch')
        answer = { submitted: eventData.ranking, correct: roundChallenge.countries }
        scoring = blitzScore(
          roundChallenge.countries,
          eventData.ranking,
          roundChallenge.maximumPoints
        )
        break
      }
      case 'flag-palette': {
        if (roundChallenge._type !== 'flag-palette-challenge') throw new TypeError('kind mismatch')
        // Palette twins (Chile/Russia) are indistinguishable from the swatches
        // alone — the shared verdict accepts any exact colour match.
        const correct = isFlagPaletteMatch(roundChallenge, eventData.ranking[0])
        answer = { submitted: eventData.ranking, correct: [roundChallenge.country] }
        scoring = clampClientScore(eventData.clientScore, roundChallenge.maximumPoints, correct)
        break
      }
      case 'capital-guess': {
        if (roundChallenge._type !== 'capital-guess-challenge') throw new TypeError('kind mismatch')
        const correct = eventData.ranking[0] === roundChallenge.country
        answer = { submitted: eventData.ranking, correct: [roundChallenge.country] }
        scoring = clampClientScore(eventData.clientScore, roundChallenge.maximumPoints, correct)
        break
      }
      case 'flashpoint': {
        if (roundChallenge._type !== 'flashpoint-challenge') throw new TypeError('kind mismatch')
        const correct = eventData.ranking[0] === roundChallenge.country
        answer = { submitted: eventData.ranking, correct: [roundChallenge.country] }
        scoring = clampClientScore(eventData.clientScore, roundChallenge.maximumPoints, correct)
        break
      }
      case 'ghost-state': {
        if (roundChallenge._type !== 'ghost-state-challenge') throw new TypeError('kind mismatch')
        answer = { submitted: eventData.ranking, correct: [roundChallenge.parent] }
        scoring = await scoreGhostState({
          challenge: roundChallenge,
          submittedGuesses: eventData.ranking,
        })
        break
      }
      case 'no-mans-land': {
        if (roundChallenge._type !== 'no-mans-land-challenge') throw new TypeError('kind mismatch')
        // An empty submission is a real answer here, not a non-answer: for
        // Bir Tawil, which nobody claims, naming nobody is the correct play.
        answer = { submitted: eventData.ranking, correct: roundChallenge.claimants }
        scoring = scoreNoMansLand({
          challenge: roundChallenge,
          submittedGuesses: eventData.ranking,
        })
        break
      }
      case 'empire': {
        if (roundChallenge._type !== 'empire-challenge') throw new TypeError('kind mismatch')
        const pots = empirePots(roundChallenge.maximumPoints)
        // Beat 1: the server re-derives correctness from the id and clamps the
        // claimed buzz points to beat 1's share — a wrong or absent buzz pays
        // nothing there, but beat 2 still scores in full.
        const guessedId = eventData.empire?.guessedId
        const named = guessedId === roundChallenge.empireId
        const beat1 = clampClientScore(eventData.empire?.clientScore, pots.name, named)
        // Beat 2: server-derived Jaccard over the pinned core; partials forgiven.
        const beat2 = scoreEmpireExtent({
          challenge: roundChallenge,
          taps: eventData.ranking,
          maximumPoints: pots.extent,
        })
        answer = {
          submitted: eventData.ranking,
          correct: roundChallenge.members,
          ...(guessedId !== undefined ? { empireGuess: { id: guessedId, correct: named } } : {}),
        }
        scoring = { scored: beat1.scored + beat2.scored, maximum: roundChallenge.maximumPoints }
        break
      }
      case 'trend-race': {
        if (roundChallenge._type !== 'trend-race-challenge') throw new TypeError('kind mismatch')
        answer = { submitted: eventData.ranking, correct: [roundChallenge.standings[0]] }
        scoring = scoreTrendRace({
          challenge: roundChallenge,
          submittedGuesses: eventData.ranking,
        })
        break
      }
      case 'pin-landmark': {
        if (roundChallenge._type !== 'pin-landmark-challenge') throw new TypeError('kind mismatch')
        // The pin IS the answer — there's no country to submit, and the server
        // resolves the landmark's real point from the slug rather than trusting
        // any distance the client claims.
        const result = scorePinLandmark({ challenge: roundChallenge, pin: eventData.pin })
        answer = {
          submitted: [],
          correct: [],
          ...(eventData.pin ? { pin: eventData.pin } : {}),
          ...(result.distanceKm !== undefined ? { distanceKm: result.distanceKm } : {}),
        }
        scoring = { scored: result.scored, maximum: result.maximum }
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
          dealtCountries: originalRanking,
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
          challenge: getFinalChallenges({ game }),
        },
      ]
      await server.updateGameState(game)
      server.emit({ event: 'group-challenge-scored', game }, eventTarget)
      return
    }

    game.rounds[length - 1].playerTurns[playerId] = { points: scoring }

    player.phase = 'group-scores'
    player.moves = movesForScoredPoints({ game, player, scored: scoring.scored })

    await server.updateGameState(game)
    server.emit({ event: 'group-challenge-scored', game }, eventTarget)
  }
)
