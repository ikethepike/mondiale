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
import { expectChallengeType } from '~~/lib/rounds'
import { blitzScore } from '~~/lib/scoring'
import { starChartAnswers } from '~~/lib/star-chart'
import { clamp01 } from '~~/lib/number'
import { roundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import type { ClientEventData } from '~~/types/events.types'
import type { Game, GroupChallengeAnswer, Round } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/** The wire submission minus its event tag — derived, so a new mode field is
 *  available here the moment the event declares it (the SubmitExtras trick). */
export type GroupSubmission = Omit<
  Extract<ClientEventData, { event: 'submit-group-challenge-answers' }>,
  'event'
>

/** An empty submission, for grading a seat that never answered. */
export const ABSENT_SUBMISSION: GroupSubmission = { ranking: [] }

/**
 * Grade one player's group-round submission — the ONE scoring path both the
 * submit handler and the round's settle task run through, so a live answer
 * and a force-settled absence can never be scored by different rules.
 *
 * `absent` marks a seat the round is settling without an answer: the mode's
 * `correct` set is still graded in for the scorecard, but the pay is zero —
 * an empty submission only counts as a correct play (no-mans-land's Bir
 * Tawil) when a live player actually locked it in.
 */
export const gradeGroupAnswer = async ({
  game,
  round,
  playerId,
  submission,
  absent = false,
}: {
  /** The rules context modes grade against (the traversal graph). */
  game: Game
  round: Round
  playerId: string
  submission: GroupSubmission
  absent?: boolean
}): Promise<{ scoring: { scored: number; maximum: number }; answer: GroupChallengeAnswer }> => {
  // The submitted ISO list means different things per round kind: a
  // ranking, a traversal guess set, named neighbours, a probe trail…
  const roundChallenge = round.groupChallenge
  const kind = roundChallengeKind(roundChallenge)
  // Definite-assignment asserted: every switch arm assigns, some through
  // the buzzOn/blitzOn closures TypeScript's flow analysis can't follow.
  let scoring!: { scored: number; maximum: number }
  let answer!: GroupChallengeAnswer

  /** Buzz modes are all-or-nothing: one target country, a client-claimed
   *  score the server clamps to the pot when the pick was right. */
  const buzzOn = (
    challenge: { country: ISOCountryCode; maximumPoints: number },
    correct = submission.ranking[0] === challenge.country
  ) => {
    answer = { submitted: submission.ranking, correct: [challenge.country] }
    scoring = clampClientScore(submission.clientScore, challenge.maximumPoints, correct)
  }

  /** Blitz modes: name as many of the answer set as the clock allows. */
  const blitzOn = (challenge: { countries: ISOCountryCode[]; maximumPoints: number }) => {
    answer = { submitted: submission.ranking, correct: challenge.countries }
    scoring = blitzScore(challenge.countries, submission.ranking, challenge.maximumPoints)
  }

  switch (kind) {
    case 'traversal': {
      const challenge = expectChallengeType(roundChallenge, 'traversal-challenge')
      answer = { submitted: submission.ranking, correct: challenge.optimalPath }
      scoring = scoreTraversalSubmission({
        challenge,
        submittedGuesses: submission.ranking,
        rules: game,
      })
      break
    }
    case 'neighbour-blitz': {
      const challenge = expectChallengeType(roundChallenge, 'neighbour-blitz-challenge')
      answer = { submitted: submission.ranking, correct: challenge.neighbours }
      scoring = blitzScore(challenge.neighbours, submission.ranking, challenge.maximumPoints)
      break
    }
    case 'hot-cold': {
      const challenge = expectChallengeType(roundChallenge, 'hot-cold-challenge')
      answer = { submitted: submission.ranking, correct: [challenge.country] }
      scoring = scoreHotCold({ challenge, submittedGuesses: submission.ranking })
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
      const guess = submission.ranking[0]
      const correct = !!guess && speaksTongue(challenge, guess)
      answer = { submitted: submission.ranking, correct: challenge.countries }
      scoring = clampClientScore(submission.clientScore, challenge.maximumPoints, correct)
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
      buzzOn(challenge, isFlagPaletteMatch(challenge, submission.ranking[0]))
      break
    }
    case 'capital-guess': {
      buzzOn(expectChallengeType(roundChallenge, 'capital-guess-challenge'))
      break
    }
    case 'star-chart': {
      // The typed answers were CITIES, but each one resolves to the country
      // whose capital it is before it leaves the view (`capitalCountryByName`),
      // so the round grades as a plain collect-a-set: the stars are the answer
      // list, and the server re-derives the overlap rather than trusting a
      // claimed score. Nothing about the round needs a `clientScore`.
      const challenge = expectChallengeType(roundChallenge, 'star-chart-challenge')
      blitzOn({
        countries: starChartAnswers(challenge),
        maximumPoints: challenge.maximumPoints,
      })
      break
    }
    case 'parliament': {
      // The answers are BENCH NAMES, not countries, so this cannot ride
      // `blitzOn` — but it is the same curve: the placements scale the pot and
      // a wrong one bites a point. The server re-derives the score from the
      // dealt benches and never trusts a claimed one; `ranking` carries only
      // the chamber, so the reveal knows which arc to paint.
      const challenge = expectChallengeType(roundChallenge, 'parliament-challenge')
      const askedNames = challenge.benches.filter(bench => bench.asked).map(bench => bench.name)
      const claimed = submission.parliament?.placed ?? []
      answer = { submitted: submission.ranking, correct: [challenge.country] }
      scoring = blitzScore(askedNames, claimed, challenge.maximumPoints)
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
        submission.ranking[0] === largestOrigin
      )
      break
    }
    case 'ghost-state': {
      const challenge = expectChallengeType(roundChallenge, 'ghost-state-challenge')
      answer = { submitted: submission.ranking, correct: [challenge.parent] }
      scoring = await scoreGhostState({ challenge, submittedGuesses: submission.ranking })
      break
    }
    case 'no-mans-land': {
      const challenge = expectChallengeType(roundChallenge, 'no-mans-land-challenge')
      // An empty submission is a real answer here, not a non-answer: for
      // Bir Tawil, which nobody claims, naming nobody is the correct play.
      answer = { submitted: submission.ranking, correct: challenge.claimants }
      scoring = scoreNoMansLand({ challenge, submittedGuesses: submission.ranking })
      break
    }
    case 'empire': {
      const challenge = expectChallengeType(roundChallenge, 'empire-challenge')
      const pots = empirePots(challenge.maximumPoints)
      // Beat 1: the server re-derives correctness from the id and clamps the
      // claimed buzz points to beat 1's share — a wrong or absent buzz pays
      // nothing there, but beat 2 still scores in full.
      const guessedId = submission.empire?.guessedId
      const named = guessedId === challenge.empireId
      const beat1 = clampClientScore(submission.empire?.clientScore, pots.name, named)
      // Beat 2: server-derived Jaccard over the pinned core; partials forgiven.
      const beat2 = scoreEmpireExtent({
        challenge,
        taps: submission.ranking,
        maximumPoints: pots.extent,
      })
      answer = {
        submitted: submission.ranking,
        correct: challenge.members,
        ...(guessedId !== undefined ? { empireGuess: { id: guessedId, correct: named } } : {}),
      }
      scoring = { scored: beat1.scored + beat2.scored, maximum: challenge.maximumPoints }
      break
    }
    case 'trend-race': {
      const challenge = expectChallengeType(roundChallenge, 'trend-race-challenge')
      answer = { submitted: submission.ranking, correct: [challenge.standings[0]] }
      scoring = scoreTrendRace({ challenge, submittedGuesses: submission.ranking })
      break
    }
    case 'pin-landmark': {
      const challenge = expectChallengeType(roundChallenge, 'pin-landmark-challenge')
      // The pin IS the answer — there's no country to submit, and the server
      // resolves the landmark's real point from the slug rather than trusting
      // any distance the client claims.
      const result = scorePinLandmark({ challenge, pin: submission.pin })
      answer = {
        submitted: [],
        correct: [],
        ...(submission.pin ? { pin: submission.pin } : {}),
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
      const named = isCorrectWaterGuess(challenge, submission.water)
      answer = { submitted: submission.ranking, correct: challenge.countries }
      scoring = clampClientScore(submission.clientScore, challenge.maximumPoints, named)
      break
    }
    case 'sketch': {
      const challenge = expectChallengeType(roundChallenge, 'sketch-challenge')
      answer = {
        // An absent seat drew nothing — the scorecard must not show it as
        // having "submitted" the answer.
        submitted: absent ? [] : [challenge.country],
        correct: [challenge.country],
        ...(submission.sketch ? { sketch: submission.sketch } : {}),
      }
      // Sketches always "count" — the client-computed similarity IS the score
      scoring = clampClientScore(submission.clientScore, challenge.maximumPoints, true)
      break
    }
    default: {
      // A mode with no scoring arm above lands here and has no ranking to
      // grade — name it, or every submission fails as an anonymous throw
      // and the round freezes with no clue which kind broke it.
      if (!('countriesPerPlayer' in roundChallenge))
        throw new TypeError(`No scoring arm for round kind: ${kind}`)
      const originalRanking = roundChallenge.countriesPerPlayer[playerId]
      if (!originalRanking) {
        // A settle can reach a seat the ranking round never dealt countries
        // to (a late joiner); there is no pot to grade against, only zero.
        if (absent) {
          answer = { submitted: [], correct: [] }
          scoring = { scored: 0, maximum: 0 }
          break
        }
        throw new ReferenceError(`Unable to retrieve original order for player: ${playerId}`)
      }

      const correctRanking = getCorrectRanking({
        groupChallengeAccessorId: roundChallenge.id,
        isoCodes: originalRanking,
      })

      answer = { submitted: submission.ranking, correct: correctRanking }
      scoring = scoreChallengeSubmission({
        groupChallengeAccessorId: roundChallenge.id,
        submittedRanking: submission.ranking,
        dealtCountries: originalRanking,
      })
    }
  }

  if (absent) scoring = { scored: 0, maximum: scoring.maximum }

  // Reveal-only, and only meaningful where a buzz happened: the score is
  // already settled above, so this needs no trust — it just lets the buzz
  // race show WHEN each player committed.
  if (typeof submission.buzzAt === 'number')
    answer = { ...answer, buzzAt: clamp01(submission.buzzAt) }

  return { scoring, answer }
}
