import { attemptSequence } from '~~/lib/attempt-boards'
import {
  attemptPicksScore,
  getCorrectRanking,
  ghostStateAnswers,
  isFlagPaletteMatch,
  scoreChallengeSubmission,
  scoreGhostState,
  scoreHotCold,
  scoreNoMansLand,
  scorePinLandmark,
  scoreTraversalSubmission,
  scoreTrendRace,
  scoreWaterGuesses,
  speaksTongue,
} from '~~/lib/challenges'
import { anthemTuneMatches, sharedTuneCountries } from '~~/lib/anthems'
import { compositionPay, parsePlacements, replayPlacements } from '~~/lib/composition'
import { compositionBoardOf, fetchCompositionSheet } from './composition-board'
import { empirePots, scoreEmpireExtent } from '~~/lib/empires'
import {
  groundPlanLayersShown,
  groundPlanRemainingFraction,
  namesGroundPlanCity,
} from '~~/lib/ground-plan'
import { hintsBought, roundHintsOnSale } from '~~/lib/hints'
import { isSketchSubmission, scoreSketchFor } from '~~/lib/outline'
import {
  remainingFractionOn,
  seatClockEndsAt,
  seatClockSeconds,
  seatWindowMsFor,
  statDetectiveCluesShown,
  statDetectiveRemainingFraction,
  TIMEOUT_SLACK_MS,
} from '~~/lib/round-beats'
import { languageBounce } from '~~/lib/language-rounds'
import { expectChallengeType } from '~~/lib/rounds'
import { blitzScore, buzzScore, hintDockedScore } from '~~/lib/scoring'
import { starChartAnswers } from '~~/lib/star-chart'
import { terraAnswers, terraRestoredHoles } from '~~/lib/terra-incognita'
import { clamp } from '~~/lib/number'
import { isPerfectSheet, scoreSheet, toSheet } from '~~/lib/two-truths'
import { loadTwoTruthsAnswers } from '~~/lib/two-truths-answers'
import { loadVintageAnswers } from '~~/lib/vintage-answers'
import { roundChallengeKind } from '~~/types/challenges/traversal-challenge.type'
import type { ClientEventData, SeatEcho } from '~~/types/events.types'
import type { Redis } from '@upstash/redis'
import type { Game, GroupChallengeAnswer, Round } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import type { SeatCursor } from '~~/types/seat.types'

/** The wire submission minus its event tag — derived, so a new mode field is
 *  available here the moment the event declares it (the SubmitExtras trick). */
export type GroupSubmission = Omit<
  Extract<ClientEventData, { event: 'submit-group-challenge-answers' }>,
  'event' | keyof SeatEcho
>

const roundIndexOf = (game: Game, round: Round): number => {
  const index = game.rounds?.indexOf(round) ?? -1
  return index >= 0 ? index : (game.rounds?.length ?? 1) - 1
}

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
 *
 * Nothing the submission claims is paid as-is: a buzz is priced off the
 * server's own clock at `at` (less the wire's `TIMEOUT_SLACK_MS`), an option
 * board off the submitted pick sequence, a sketch off the drawing itself, and
 * every hint off the seat cursor's record.
 */
export const gradeGroupAnswer = async ({
  game,
  round,
  playerId,
  submission,
  seat,
  at = Date.now(),
  absent = false,
  redis,
}: {
  /** The rules context modes grade against (the traversal graph). */
  game: Game
  round: Round
  playerId: string
  submission: GroupSubmission
  /** The answering seat's cursor: its own play window and its bought hints. */
  seat?: Pick<SeatCursor, 'deadline' | 'hints' | 'spent'>
  /** When the answer reached the server. */
  at?: number
  absent?: boolean
  /** Where the rounds that grade server-held state (Composition's sheet) read it. */
  redis?: Pick<Redis, 'get'>
}): Promise<{ scoring: { scored: number; maximum: number }; answer: GroupChallengeAnswer }> => {
  // The submitted ISO list means different things per round kind: a
  // ranking, a traversal guess set, named neighbours, a probe trail…
  const roundChallenge = round.groupChallenge
  const kind = roundChallengeKind(roundChallenge)
  // Definite-assignment asserted: every switch arm assigns, some through
  // the buzzOn/blitzOn closures TypeScript's flow analysis can't follow.
  let scoring!: { scored: number; maximum: number }
  let answer!: GroupChallengeAnswer

  const pricedAt = at - TIMEOUT_SLACK_MS
  /** The seat's shot clock still to run when the answer left the player. */
  const clockFraction = (moment = pricedAt) =>
    remainingFractionOn(
      seatClockEndsAt(round, seat?.deadline),
      seatClockSeconds(roundChallenge),
      moment
    )
  /** How far into the round's play window the answer left the player, in ms;
   *  undefined while the window is unstamped. */
  const elapsedMs = () =>
    round.playStartsAt === undefined ? undefined : Math.max(0, pricedAt - round.playStartsAt)
  const bought = hintsBought(seat, roundHintsOnSale(roundChallenge))
  /** The fraction a landed buzz was priced on — what the reveal's buzz race draws. */
  let landedAt: number | undefined
  /** `buzzScore` for a landed buzz, recording the fraction it was priced on. */
  const landBuzz = (maximumPoints: number, fraction: number) => {
    landedAt = fraction
    return buzzScore(maximumPoints, fraction)
  }

  /** Buzz modes are all-or-nothing: one target country, paid on the buzz
   *  curve at `fraction` when the pick was right. */
  const buzzOn = (
    challenge: { country: ISOCountryCode; maximumPoints: number },
    correct = submission.ranking[0] === challenge.country,
    fraction = clockFraction()
  ) => {
    answer = { submitted: submission.ranking, correct: [challenge.country] }
    scoring = {
      scored: correct ? landBuzz(challenge.maximumPoints, fraction) : 0,
      maximum: challenge.maximumPoints,
    }
  }

  /** The recognition modes with a small option table outside hard mode: the
   *  table pays by the attempt the answer landed on in the submitted pick
   *  sequence, the free-typed board by the clock. */
  const attemptsOn = (
    challenge: { country: ISOCountryCode; maximumGuesses?: number; maximumPoints: number },
    fraction?: number
  ) => {
    if (!challenge.maximumGuesses) return buzzOn(challenge, undefined, fraction)
    const picks = attemptSequence(seat?.spent, submission.ranking)
    answer = { submitted: picks, correct: [challenge.country] }
    scoring = {
      scored: attemptPicksScore(
        picks,
        challenge.country,
        challenge.maximumGuesses,
        challenge.maximumPoints
      ),
      maximum: challenge.maximumPoints,
    }
  }

  /** Blitz modes: name as many of the answer set as the clock allows. */
  const blitzOn = (
    challenge: { countries: ISOCountryCode[]; maximumPoints: number },
    /** What the guesses actually claimed, where a mode accepts more than one
     *  name per answer (Terra Incognita's absorbers). Defaults to the raw
     *  submission, which is every other blitz mode. */
    claimed: ISOCountryCode[] = submission.ranking
  ) => {
    answer = { submitted: claimed, correct: challenge.countries }
    scoring = blitzScore(challenge.countries, claimed, challenge.maximumPoints)
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
    case 'pyramid-scheme': {
      const challenge = expectChallengeType(roundChallenge, 'pyramid-scheme-challenge')
      // A round dealt before the redesign carries `countries[]` and no subject:
      // the buzz fallback would grade `undefined === undefined` as a hit.
      if (!challenge.country) {
        answer = { submitted: [], correct: [] }
        scoring = { scored: 0, maximum: challenge.maximumPoints }
        break
      }
      attemptsOn(challenge)
      break
    }
    case 'silhouette': {
      buzzOn(expectChallengeType(roundChallenge, 'silhouette-challenge'))
      break
    }
    case 'anthem-buzz': {
      const challenge = expectChallengeType(roundChallenge, 'anthem-buzz-challenge')
      const guess = submission.ranking[0]
      buzzOn(challenge, !!guess && anthemTuneMatches(challenge.country, guess))
      answer.correct = sharedTuneCountries(challenge.country)
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
      scoring = {
        scored: correct ? landBuzz(challenge.maximumPoints, clockFraction()) : 0,
        maximum: challenge.maximumPoints,
      }
      break
    }
    case 'stat-detective': {
      const challenge = expectChallengeType(roundChallenge, 'stat-detective-challenge')
      const elapsed = elapsedMs()
      buzzOn(
        challenge,
        undefined,
        elapsed === undefined
          ? 0
          : statDetectiveRemainingFraction(challenge, statDetectiveCluesShown(challenge, elapsed))
      )
      break
    }
    case 'two-truths': {
      const challenge = expectChallengeType(roundChallenge, 'two-truths-challenge')
      const answers = await loadTwoTruthsAnswers()
      if (!answers) throw new Error('Two Truths graded without its answer key')
      const truths = answers.twoTruthsVerdicts(challenge)
      const sheet = toSheet(absent ? undefined : submission.sheet, truths.length)
      const perfect = isPerfectSheet(sheet, truths)
      // The bonus goes to the first perfect sheet banked — answers land on the
      // game's queue one at a time, so "already banked" is a total order.
      const firstPerfect =
        perfect &&
        !Object.entries(round.groupAnswers).some(
          ([id, banked]) =>
            id !== playerId && !!banked.sheet && isPerfectSheet(banked.sheet, truths)
        )
      answer = {
        submitted: perfect ? [challenge.country] : [],
        correct: [challenge.country],
        ...(absent ? {} : { sheet }),
      }
      scoring = {
        scored: hintDockedScore(
          scoreSheet({ sheet, truths, maximumPoints: challenge.maximumPoints, firstPerfect }),
          challenge.maximumPoints,
          bought
        ),
        maximum: challenge.maximumPoints,
      }
      break
    }
    case 'river-run':
    case 'shared-shores':
    case 'highlands': {
      blitzOn(expectChallengeType(roundChallenge, 'water-blitz-challenge'))
      break
    }
    case 'mother-tongue': {
      const challenge = expectChallengeType(roundChallenge, 'mother-tongue-challenge')
      blitzOn(
        challenge,
        submission.ranking.filter(isoCode => !languageBounce(challenge, isoCode))
      )
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
      attemptsOn(expectChallengeType(roundChallenge, 'capital-guess-challenge'))
      break
    }
    case 'ground-plan': {
      const challenge = expectChallengeType(roundChallenge, 'ground-plan-challenge')
      const cities = Array.isArray(submission.cities) ? submission.cities : []
      const namesCity = (city: unknown) => namesGroundPlanCity(challenge, city)
      // A wrong city in the right country is a miss, so the options price
      // on the named cities rather than the country the ranking carries.
      if (challenge.maximumGuesses) {
        const scored = attemptPicksScore(
          attemptSequence(seat?.spent, cities),
          namesCity,
          challenge.maximumGuesses,
          challenge.maximumPoints
        )
        answer = { submitted: scored > 0 ? [challenge.country] : [], correct: [challenge.country] }
        scoring = { scored, maximum: challenge.maximumPoints }
        break
      }
      // The typed board pays by the layers on screen, not the seconds.
      const elapsed = elapsedMs()
      buzzOn(
        challenge,
        submission.ranking[0] === challenge.country && namesCity(cities[0]),
        elapsed === undefined
          ? 0
          : groundPlanRemainingFraction(challenge, groundPlanLayersShown(challenge, elapsed / 1000))
      )
      break
    }
    case 'star-chart': {
      // The typed answers were CITIES, but each one resolves to the country
      // whose capital it is before it leaves the view (`capitalCountryByName`),
      // so the round grades as a plain collect-a-set: the stars are the answer
      // list, and the server re-derives the overlap.
      const challenge = expectChallengeType(roundChallenge, 'star-chart-challenge')
      blitzOn({
        countries: starChartAnswers(challenge),
        maximumPoints: challenge.maximumPoints,
      })
      break
    }
    case 'terra-incognita': {
      // A plain collect-a-set over the deck the atlas swallowed. The vanish
      // schedule is deterministic (`cadenceMs` + the dealt order), so the
      // server never has to be told which countries were gone — it grades the
      // same answer set the player watched disappear, and a collapsed world
      // scores exactly the restorations it banked before it fell.
      const challenge = expectChallengeType(roundChallenge, 'terra-incognita-challenge')
      // Either name restores a hole — the country that went, or the land that
      // swallowed it. Resolved HERE rather than trusted from the submission:
      // the client sends what it thinks it claimed, and the server re-derives
      // it from the challenge so a hand-rolled payload cannot invent one.
      // Aliasing the guesses (not widening the answer set) keeps the pot
      // divided by the deck, so accepting a second name costs nobody points.
      const restored = terraRestoredHoles(challenge, submission.ranking)
      blitzOn(
        { countries: terraAnswers(challenge), maximumPoints: challenge.maximumPoints },
        restored
      )
      break
    }
    case 'flashpoint': {
      attemptsOn(expectChallengeType(roundChallenge, 'flashpoint-challenge'))
      break
    }
    case 'composition': {
      // A bot's placements were composed by the server; a person's are the
      // drops the drop handler graded, never what the submission claims.
      const challenge = expectChallengeType(roundChallenge, 'composition-challenge')
      const { board } = await compositionBoardOf(challenge)
      const attempts = game.players?.[playerId]?.bot
        ? parsePlacements(submission.composition?.placements)
        : redis
          ? ((await fetchCompositionSheet(redis, game.id, roundIndexOf(game, round)))[playerId] ??
            [])
          : []
      const replay = replayPlacements(board, attempts)
      const standing = new Set(Object.values(replay.placed))
      answer = {
        submitted: challenge.options.filter(isoCode => standing.has(isoCode)),
        correct: [...challenge.options],
      }
      scoring = {
        scored: compositionPay({ ...board, maximumPoints: challenge.maximumPoints }, replay),
        maximum: challenge.maximumPoints,
      }
      break
    }
    case 'ghost-state': {
      const challenge = expectChallengeType(roundChallenge, 'ghost-state-challenge')
      const { RECOGNITION_TERRITORIES } = await import('~~/data/recognition.gen')
      const territory = RECOGNITION_TERRITORIES[challenge.territoryId]
      answer = { submitted: submission.ranking, correct: ghostStateAnswers(challenge, territory) }
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
      // Beat 1: the server re-derives correctness from the id and prices the
      // buzz on beat 1's clock at the moment it opened the seat's tap window
      // (`round-play`) — a wrong or absent buzz pays nothing there, but beat 2
      // still scores in full.
      const guessedId = submission.empire?.guessedId
      const named = guessedId === challenge.empireId
      const window = seatWindowMsFor(challenge)
      const buzzedAt =
        seat?.deadline !== undefined && window
          ? seat.deadline - window - TIMEOUT_SLACK_MS
          : pricedAt
      const beat1 = named ? landBuzz(pots.name, clockFraction(buzzedAt)) : 0
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
      scoring = { scored: beat1 + beat2.scored, maximum: challenge.maximumPoints }
      break
    }
    case 'trend-race': {
      const challenge = expectChallengeType(roundChallenge, 'trend-race-challenge')
      answer = { submitted: submission.ranking, correct: [challenge.standings[0]] }
      scoring = scoreTrendRace({ challenge, submittedGuesses: submission.ranking })
      break
    }
    case 'vintage': {
      const challenge = expectChallengeType(roundChallenge, 'vintage-challenge')
      const answers = await loadVintageAnswers()
      if (!answers) throw new Error('Vintage graded without its answer key')
      const sent = absent ? undefined : submission.year
      const year =
        typeof sent === 'number' && Number.isFinite(sent)
          ? clamp(Math.round(sent), challenge.range[0], challenge.range[1])
          : undefined
      answer = { submitted: [], correct: [], ...(year !== undefined ? { year } : {}) }
      scoring = answers.scoreVintage({ challenge, difficulty: game.difficulty, year })
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
      // The guesses aren't ISO codes, so the server grades the named features
      // itself. The scorecard shows the shore countries as the answer.
      answer = { submitted: submission.ranking, correct: challenge.countries }
      scoring = scoreWaterGuesses(challenge, submission.water, bought)
      break
    }
    case 'sketch': {
      const challenge = expectChallengeType(roundChallenge, 'sketch-challenge')
      const drawn = isSketchSubmission(submission.sketch) ? submission.sketch : undefined
      answer = {
        // An absent seat drew nothing — the scorecard must not show it as
        // having "submitted" the answer.
        submitted: absent ? [] : [challenge.country],
        correct: [challenge.country],
        ...(drawn ? { sketch: drawn } : {}),
      }
      // The similarity IS the score, measured here against the country itself
      scoring = {
        scored: drawn ? await scoreSketchFor(challenge.country, drawn, challenge.maximumPoints) : 0,
        maximum: challenge.maximumPoints,
      }
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

  if (landedAt !== undefined && !absent) answer = { ...answer, buzzAt: landedAt }

  return { scoring, answer }
}
