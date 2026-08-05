import {
  clampClientScore,
  getCorrectRanking,
  isCorrectWaterGuess,
  isFlagPaletteMatch,
  scoreChallengeSubmission,
  scoreGhostState,
  scoreHotCold,
  scoreNoMansLand,
  scorePinLandmark,
  scoreTraversalSubmission,
  scoreTrendRace,
  speaksTongue,
} from '~~/lib/challenges'
import { empirePots, scoreEmpireExtent } from '~~/lib/empires'
import { expectChallengeType, latestRound } from '~~/lib/rounds'
import { blitzScore } from '~~/lib/scoring'
import { clamp01 } from '~~/lib/number'
import { roundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import type { GroupChallengeAnswer } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import { defineGameHandler } from '../server-side'
import { movesForScoredPoints, startWalk } from './moves'

export const submitGroupChallengeAnswersHandler = defineGameHandler(
  'submit-group-challenge-answers',
  async ({ game, player, server, eventData, eventTarget }) => {
    const { playerId } = eventTarget
    const currentRound = latestRound(game)
    if (!currentRound) throw new ReferenceError('No round in play to submit answers for')

    // A repeat submission (double-click, reconnect replay) would re-score the
    // round and rebuild the player's moves — possibly mid-walk.
    if (currentRound.groupAnswers[playerId]) {
      // …but an answer banked while the phase advance was LOST leaves the seat
      // parked in 'group-challenge' forever, and `readyForNextTurn` in
      // enter-movement-phase requires every seat settled — one such seat
      // freezes the whole table. Re-derive the advance from the already-banked
      // score instead of bailing, so the retry the client is already sending
      // becomes the cure. Idempotent: the score is read, never recomputed.
      if (player.phase === 'group-challenge') {
        const banked = currentRound.playerTurns[playerId]?.points
        console.warn(`Healing stranded submitter ${playerId} (answer banked, phase was not)`)
        player.phase = 'group-scores'
        startWalk(player, await movesForScoredPoints({ game, player, scored: banked?.scored ?? 0 }))
        await server.updateGameState(game)
        server.emit({ event: 'group-challenge-scored', game }, eventTarget)
        return
      }
      return console.warn(`Duplicate round submission ignored for player: ${playerId}`)
    }

    // The submitted ISO list means different things per round kind: a
    // ranking, a traversal guess set, named neighbours, a probe trail…
    const roundChallenge = currentRound.groupChallenge
    const kind = roundChallengeKind(roundChallenge)
    // Definite-assignment asserted: every switch arm assigns, some through
    // the buzzOn/blitzOn closures TypeScript's flow analysis can't follow.
    let scoring!: { scored: number; maximum: number }
    let answer!: GroupChallengeAnswer

    /** Buzz modes are all-or-nothing: one target country, a client-claimed
     *  score the server clamps to the pot when the pick was right. */
    const buzzOn = (
      challenge: { country: ISOCountryCode; maximumPoints: number },
      correct = eventData.ranking[0] === challenge.country
    ) => {
      answer = { submitted: eventData.ranking, correct: [challenge.country] }
      scoring = clampClientScore(eventData.clientScore, challenge.maximumPoints, correct)
    }

    /** Blitz modes: name as many of the answer set as the clock allows. */
    const blitzOn = (challenge: { countries: ISOCountryCode[]; maximumPoints: number }) => {
      answer = { submitted: eventData.ranking, correct: challenge.countries }
      scoring = blitzScore(challenge.countries, eventData.ranking, challenge.maximumPoints)
    }

    switch (kind) {
      case 'traversal': {
        const challenge = expectChallengeType(roundChallenge, 'traversal-challenge')
        answer = { submitted: eventData.ranking, correct: challenge.optimalPath }
        scoring = scoreTraversalSubmission({
          challenge,
          submittedGuesses: eventData.ranking,
        })
        break
      }
      case 'neighbour-blitz': {
        const challenge = expectChallengeType(roundChallenge, 'neighbour-blitz-challenge')
        answer = { submitted: eventData.ranking, correct: challenge.neighbours }
        scoring = blitzScore(challenge.neighbours, eventData.ranking, challenge.maximumPoints)
        break
      }
      case 'hot-cold': {
        const challenge = expectChallengeType(roundChallenge, 'hot-cold-challenge')
        answer = { submitted: eventData.ranking, correct: [challenge.country] }
        scoring = scoreHotCold({ challenge, submittedGuesses: eventData.ranking })
        break
      }
      case 'silhouette': {
        buzzOn(expectChallengeType(roundChallenge, 'silhouette-challenge'))
        break
      }
      case 'anthem-buzz': {
        buzzOn(expectChallengeType(roundChallenge, 'anthem-buzz-challenge'))
        break
      }
      case 'tongue-buzz': {
        // Every country speaking the language is a correct answer, so this is
        // a membership test — through the same predicate the client paid out
        // on — and the reveal lists the whole set as `correct`.
        const challenge = expectChallengeType(roundChallenge, 'tongue-buzz-challenge')
        const guess = eventData.ranking[0]
        const correct = !!guess && speaksTongue(challenge, guess)
        answer = { submitted: eventData.ranking, correct: challenge.countries }
        scoring = clampClientScore(eventData.clientScore, challenge.maximumPoints, correct)
        break
      }
      case 'stat-detective': {
        buzzOn(expectChallengeType(roundChallenge, 'stat-detective-challenge'))
        break
      }
      case 'two-truths': {
        // Spotting the lie is all-or-nothing; the client reports the pick as
        // the mystery country when the lie was found
        buzzOn(expectChallengeType(roundChallenge, 'two-truths-challenge'))
        break
      }
      case 'river-run':
      case 'shared-shores':
      case 'highlands': {
        blitzOn(expectChallengeType(roundChallenge, 'water-blitz-challenge'))
        break
      }
      case 'mother-tongue': {
        blitzOn(expectChallengeType(roundChallenge, 'mother-tongue-challenge'))
        break
      }
      case 'flag-palette': {
        // Palette twins (Chile/Russia) are indistinguishable from the swatches
        // alone — the shared verdict accepts any exact colour match.
        const challenge = expectChallengeType(roundChallenge, 'flag-palette-challenge')
        buzzOn(challenge, isFlagPaletteMatch(challenge, eventData.ranking[0]))
        break
      }
      case 'capital-guess': {
        buzzOn(expectChallengeType(roundChallenge, 'capital-guess-challenge'))
        break
      }
      case 'flashpoint': {
        buzzOn(expectChallengeType(roundChallenge, 'flashpoint-challenge'))
        break
      }
      case 'composition': {
        // The answer is the largest origin — the head slice — NOT `country`,
        // which is the country whose residents are being split. Same source
        // the view grades against (slices[0]), so both sides agree.
        const challenge = expectChallengeType(roundChallenge, 'composition-challenge')
        const largestOrigin = challenge.slices[0]?.isoCode
        if (!largestOrigin) throw new ReferenceError('Composition challenge dealt with no slices')
        buzzOn(
          { country: largestOrigin, maximumPoints: challenge.maximumPoints },
          eventData.ranking[0] === largestOrigin
        )
        break
      }
      case 'ghost-state': {
        const challenge = expectChallengeType(roundChallenge, 'ghost-state-challenge')
        answer = { submitted: eventData.ranking, correct: [challenge.parent] }
        scoring = await scoreGhostState({ challenge, submittedGuesses: eventData.ranking })
        break
      }
      case 'no-mans-land': {
        const challenge = expectChallengeType(roundChallenge, 'no-mans-land-challenge')
        // An empty submission is a real answer here, not a non-answer: for
        // Bir Tawil, which nobody claims, naming nobody is the correct play.
        answer = { submitted: eventData.ranking, correct: challenge.claimants }
        scoring = scoreNoMansLand({ challenge, submittedGuesses: eventData.ranking })
        break
      }
      case 'empire': {
        const challenge = expectChallengeType(roundChallenge, 'empire-challenge')
        const pots = empirePots(challenge.maximumPoints)
        // Beat 1: the server re-derives correctness from the id and clamps the
        // claimed buzz points to beat 1's share — a wrong or absent buzz pays
        // nothing there, but beat 2 still scores in full.
        const guessedId = eventData.empire?.guessedId
        const named = guessedId === challenge.empireId
        const beat1 = clampClientScore(eventData.empire?.clientScore, pots.name, named)
        // Beat 2: server-derived Jaccard over the pinned core; partials forgiven.
        const beat2 = scoreEmpireExtent({
          challenge,
          taps: eventData.ranking,
          maximumPoints: pots.extent,
        })
        answer = {
          submitted: eventData.ranking,
          correct: challenge.members,
          ...(guessedId !== undefined ? { empireGuess: { id: guessedId, correct: named } } : {}),
        }
        scoring = { scored: beat1.scored + beat2.scored, maximum: challenge.maximumPoints }
        break
      }
      case 'trend-race': {
        const challenge = expectChallengeType(roundChallenge, 'trend-race-challenge')
        answer = { submitted: eventData.ranking, correct: [challenge.standings[0]] }
        scoring = scoreTrendRace({ challenge, submittedGuesses: eventData.ranking })
        break
      }
      case 'pin-landmark': {
        const challenge = expectChallengeType(roundChallenge, 'pin-landmark-challenge')
        // The pin IS the answer — there's no country to submit, and the server
        // resolves the landmark's real point from the slug rather than trusting
        // any distance the client claims.
        const result = scorePinLandmark({ challenge, pin: eventData.pin })
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
        const challenge = expectChallengeType(roundChallenge, 'name-water-challenge')
        // The guess isn't an ISO code, so the server re-checks the named
        // feature itself and clamps the claim — a claim with no matching guess
        // pays nothing. The scorecard shows the shore countries as the answer.
        const named = isCorrectWaterGuess(challenge, eventData.water)
        answer = { submitted: eventData.ranking, correct: challenge.countries }
        scoring = clampClientScore(eventData.clientScore, challenge.maximumPoints, named)
        break
      }
      case 'sketch': {
        const challenge = expectChallengeType(roundChallenge, 'sketch-challenge')
        answer = {
          submitted: [challenge.country],
          correct: [challenge.country],
          sketch: eventData.sketch,
        }
        // Sketches always "count" — the client-computed similarity IS the score
        scoring = clampClientScore(eventData.clientScore, challenge.maximumPoints, true)
        break
      }
      default: {
        // A mode with no scoring arm above lands here and has no ranking to
        // grade — name it, or every submission fails as an anonymous throw
        // and the round freezes with no clue which kind broke it.
        if (!('countriesPerPlayer' in roundChallenge))
          throw new TypeError(`No scoring arm for round kind: ${kind}`)
        const originalRanking = roundChallenge.countriesPerPlayer[playerId]
        if (!originalRanking)
          throw new ReferenceError(`Unable to retrieve original order for player: ${playerId}`)

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

    // Reveal-only, and only meaningful where a buzz happened: the score is
    // already settled above, so this needs no trust — it just lets the buzz
    // race show WHEN each player committed.
    currentRound.groupAnswers[playerId] =
      typeof eventData.buzzAt === 'number'
        ? { ...answer, buzzAt: clamp01(eventData.buzzAt) }
        : answer

    // Test hook: FORCE_FINAL_CHALLENGE=1 teleports every player next to the
    // final tile after this round, so its gauntlet starts within seconds
    if (typeof process !== 'undefined' && process.env?.FORCE_FINAL_CHALLENGE === '1') {
      const finalTile = game.tiles[game.tiles.length - 1]
      currentRound.playerTurns[playerId] = { points: scoring }
      player.phase = 'group-scores'
      player.currentPosition = finalTile.position - 1
      const { getFinalChallenges } = await import('~~/lib/challenges/final-challenge')
      startWalk(player, [
        {
          endTile: finalTile,
          challenge: getFinalChallenges({ game }),
        },
      ])
      await server.updateGameState(game)
      server.emit({ event: 'group-challenge-scored', game }, eventTarget)
      return
    }

    currentRound.playerTurns[playerId] = { points: scoring }

    player.phase = 'group-scores'
    startWalk(player, await movesForScoredPoints({ game, player, scored: scoring.scored }))

    await server.updateGameState(game)
    server.emit({ event: 'group-challenge-scored', game }, eventTarget)
  }
)
