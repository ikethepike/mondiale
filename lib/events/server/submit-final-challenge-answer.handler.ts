import { CITY_LIGHTS } from '~~/data/cities.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { dealReplacementChallenge, sunsetQuota } from '~~/lib/challenges/final-challenge'
import { getValueByAccessorID } from '~~/lib/values'
import { variantCountries } from '~~/lib/variant'
import { isValidISOCode } from '~~/types/geography.types'
import { defineGameHandler, enqueueGameTask } from '../server-side'
import { enterMovementPhaseHandler } from './enter-movement-phase.handler'

export const submitFinalChallengeAnswerHandler = defineGameHandler(
  'submit-final-challenge-answer',
  async ({ game, player, server, eventData, eventTarget, io, redis, socket }) => {
    // Idempotency guard: only accept a final-challenge answer while the
    // player is genuinely in the gauntlet. A duplicate submit (reconnect
    // replay, second tab) that races the +5s reveal pacing would otherwise
    // shift a SECOND question off the gauntlet — silently skipping it — or
    // re-run a correct answer against the next question.
    if (player.phase !== 'final-challenge') {
      return console.warn(`Ignoring stale/duplicate final submit (phase: ${player.phase})`)
    }

    const currentMove = player.moves[0]
    if (!currentMove) {
      return console.warn(`Unable to retrieve current challenge`)
    }

    if (currentMove.challenge?._type !== 'final-challenge') {
      throw new TypeError(`Individual challenge found in final challenge handler`)
    }

    // Verify against the head question without consuming it — a thrown type
    // mismatch must not eat a question the player never really answered
    const currentChallenge = currentMove.challenge.challenges[0]
    if (!currentChallenge) {
      return console.warn(`Final challenge submitted with no questions left`)
    }

    // Idempotency latch. The per-game queue already serializes handlers, so it
    // rules out two answers interleaving mid-mutation. What it can NOT rule out
    // is a duplicate (double-click, reconnect replay) that arrives AFTER the
    // first fully completed — by then the question has been shifted, so the
    // duplicate is indistinguishable by array state from a genuine answer to
    // the NEXT question, and would wrongly consume it.
    //
    // The reveal is what gates the next question: the client can't submit the
    // next answer until it receives `final-challenge-checked` (emitted 5s
    // later). So we latch `resolving` here and clear it only in that reveal
    // follow-up. Any submit arriving inside the 5s window — i.e. a duplicate of
    // the question just answered — is rejected; the next genuine answer arrives
    // after the reveal, with the latch already cleared.
    if (player.resolving) {
      return console.warn(`Final challenge answer already being processed — ignoring duplicate`)
    }
    player.resolving = true

    const { submittedAnswer } = eventData

    const throwTypeMismatch = () => {
      throw new TypeError(
        `Challenge type mismatch: ${submittedAnswer._type || currentChallenge._type}`
      )
    }

    let correct = false
    switch (currentChallenge._type) {
      case 'region-challenge':
        {
          if (submittedAnswer._type !== 'region-challenge') {
            return throwTypeMismatch()
          }

          const correctRegion = COUNTRIES[currentChallenge.country].region
          correct = correctRegion === submittedAnswer.region
        }
        break
      case 'max-challenge':
      case 'min-challenge':
      case 'leadership-challenge':
        {
          if (submittedAnswer._type === 'region-challenge') return throwTypeMismatch()
          if (!isValidISOCode(submittedAnswer.isoCode)) {
            correct = false
            break
          }

          const { isoCode } = submittedAnswer
          correct = currentChallenge.country === isoCode
        }
        break
      case 'language-challenge':
        {
          if (submittedAnswer._type === 'region-challenge') return throwTypeMismatch()
          if (!isValidISOCode(submittedAnswer.isoCode)) {
            correct = false
            break
          }

          const submittedCountry = COUNTRIES[submittedAnswer.isoCode]
          correct = submittedCountry.languages.some(language => {
            return language === currentChallenge.language
          })
        }
        break
      case 'membership-challenge':
        {
          if (submittedAnswer._type !== 'membership-challenge') return throwTypeMismatch()
          if (!isValidISOCode(submittedAnswer.isoCode)) {
            correct = false
            break
          }

          correct = submittedAnswer.isoCode === currentChallenge.exception
        }
        break
      case 'born-challenge':
        {
          if (submittedAnswer._type !== 'born-challenge') return throwTypeMismatch()

          // Quota of distinct picks, every one of which must qualify
          const picks = [...new Set(submittedAnswer.isoCodes)].filter(isValidISOCode)
          correct =
            picks.length >= currentChallenge.quota &&
            picks.every(isoCode => {
              const independence = COUNTRIES[isoCode].government.independence
              return !!independence && independence.amount > currentChallenge.year
            })
        }
        break
      case 'made-challenge':
        {
          if (submittedAnswer._type !== 'made-challenge') return throwTypeMismatch()
          if (!isValidISOCode(submittedAnswer.isoCode)) {
            correct = false
            break
          }

          const exports = COUNTRIES[submittedAnswer.isoCode].economics.exports ?? []
          correct = exports.includes(currentChallenge.commodity)
        }
        break
      case 'scales-challenge':
        {
          if (submittedAnswer._type !== 'scales-challenge') return throwTypeMismatch()

          const picks = [...new Set(submittedAnswer.isoCodes)].filter(isValidISOCode)
          if (
            !picks.length ||
            picks.length > currentChallenge.maxPicks ||
            picks.includes(currentChallenge.target)
          ) {
            correct = false
            break
          }

          const target = getValueByAccessorID(
            currentChallenge.target,
            currentChallenge.accessorId
          )?.amount
          if (!target) {
            correct = false
            break
          }

          let combined = 0
          for (const isoCode of picks) {
            combined += getValueByAccessorID(isoCode, currentChallenge.accessorId)?.amount ?? 0
          }
          correct =
            combined >= target * (1 - currentChallenge.tolerance) &&
            combined <= target * (1 + currentChallenge.tolerance)
        }
        break
      case 'city-nocturne-challenge':
        {
          if (submittedAnswer._type !== 'city-nocturne-challenge') return throwTypeMismatch()

          // Client-trust: validate the lit names against the dealt city set
          const dealt = new Set(
            (CITY_LIGHTS[currentChallenge.country] ?? [])
              .slice(0, currentChallenge.cityCount)
              .map(city => city.name)
          )
          const lit = [...new Set(submittedAnswer.namedCities)].filter(name => dealt.has(name))
          correct = lit.length >= currentChallenge.quota
        }
        break
      case 'sunset-blitz-challenge':
        {
          if (submittedAnswer._type !== 'sunset-blitz-challenge') return throwTypeMismatch()

          // Client-trust like higher-lower gates. The whole board is nameable
          // (the camera shows more than the dealt window), so validate against
          // the variant pool; the quota is a share of the dealt window.
          const board = new Set(variantCountries(game.variant))
          const named = [...new Set(submittedAnswer.namedCountries)].filter(
            isoCode => isValidISOCode(isoCode) && board.has(isoCode)
          )
          correct = named.length >= sunsetQuota(currentChallenge)
        }
        break
    }

    const gauntlet = currentMove.challenge
    if (correct) {
      // Correct: the question is now consumed.
      gauntlet.answeredCorrect += 1
      gauntlet.challenges.shift()
    } else {
      // A life absorbs the miss: burn the question and advance. Victory must
      // end on a correct answer, so a missed LAST question is replaced with a
      // fresh one instead of skipped — burn-and-advance can never empty the
      // queue.
      let survives = gauntlet.lives > 0
      if (survives) {
        gauntlet.lives -= 1
        if (gauntlet.challenges.length > 1) {
          gauntlet.challenges.shift()
        } else {
          const replacement = dealReplacementChallenge({
            game,
            exclude: [currentChallenge._type],
          })
          if (replacement) gauntlet.challenges[0] = replacement
          else survives = false
        }
      }

      // Out of lives: knocked out of the gauntlet. The result pause runs
      // OUTSIDE the per-game queue — holding the lock for five seconds would
      // stall every other player — and the follow-up re-enters through the
      // queue with a fresh game fetch.
      if (!survives) {
        player.moves = []
        await server.updateGameState(game)
        setTimeout(() => {
          enqueueGameTask(eventTarget.gameId, () =>
            enterMovementPhaseHandler({
              io,
              redis,
              socket,
              eventTarget,
              eventKey: 'enter-movement-phase',
              eventData: { event: 'enter-movement-phase' },
            })
          )
        }, 5000)
        return
      }
    }

    // Gauntlet cleared — victory. The phase flip alone now blocks further
    // submits, so the `resolving` latch can stay set.
    const won = currentMove.challenge.challenges.length === 0
    if (won) {
      player.phase = 'victory'
      player.completedAtRound = game.rounds.length
    }

    await server.updateGameState(game)

    // Reaching victory here happens OUTSIDE enter-movement-phase, so nobody
    // re-checks round advancement. If this winner was the LAST player to
    // settle, everyone else is parked in movement-summary waiting for a
    // `new-round` that would never fire. Re-enter the movement phase (which now
    // skips settled players and only runs the advancement check) so it stages
    // and reveals the next round for the remaining players.
    if (won) {
      setTimeout(() => {
        enqueueGameTask(eventTarget.gameId, () =>
          enterMovementPhaseHandler({
            io,
            redis,
            socket,
            eventTarget,
            eventKey: 'enter-movement-phase',
            eventData: { event: 'enter-movement-phase' },
          })
        )
      }, 0)
    }

    // Pace the reveal: the client shows its own result beat first, then the
    // next question (or victory) lands. The pause runs OUTSIDE the queue. The
    // follow-up re-enters the queue to CLEAR the `resolving` latch (with a
    // fresh fetch) before emitting, so the next genuine answer — which can only
    // come after this reveal — is accepted while duplicates fired during the
    // pause were already rejected.
    setTimeout(() => {
      enqueueGameTask(eventTarget.gameId, async () => {
        const fresh = await server.fetchGame(eventTarget.gameId)
        const freshPlayer = fresh?.players[eventTarget.playerId]
        if (fresh && freshPlayer?.resolving) {
          freshPlayer.resolving = false
          await server.updateGameState(fresh)
          return server.emit({ event: 'final-challenge-checked', game: fresh }, eventTarget)
        }
        // Latch already cleared (or game gone) — just reveal the last state.
        server.emit({ event: 'final-challenge-checked', game: fresh ?? game }, eventTarget)
      })
    }, 5000)
  },
  { player: 'warn' }
)
