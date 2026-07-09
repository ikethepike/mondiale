import { COUNTRIES } from '~~/data/countries.gen'
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
          if (submittedAnswer._type === 'region-challenge') return throwTypeMismatch()
          if (!isValidISOCode(submittedAnswer.isoCode)) {
            correct = false
            break
          }

          correct = submittedAnswer.isoCode === currentChallenge.exception
        }
        break
    }

    // Wrong answer knocks the player out of the gauntlet. The result pause
    // runs OUTSIDE the per-game queue — holding the lock for five seconds
    // would stall every other player — and the follow-up re-enters through
    // the queue with a fresh game fetch.
    if (!correct) {
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

    // Correct: the question is now consumed.
    currentMove.challenge.challenges.shift()

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
