import { playableCountries } from '~~/lib/game-rules'
import { defineGameHandler } from '../server-side'
import { scheduleGameTask } from './deferred-task'
import { scheduleMovementPhase } from './enter-movement-phase.handler'

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

    // Deferred module: only loads once a game reaches the gauntlet (#110).
    const { dealReplacementChallenge, isCorrectFinalAnswer } =
      await import('~~/lib/challenges/final-challenge')

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

    // An odd-one-out question offers a lineup, and only the lineup. Off it sit
    // countries that ALSO genuinely don't belong — a capped African Union
    // roster leaves 31 real members unlit — so scoring such a tap would burn a
    // life for a defensible answer. The view ignores them; reject here too,
    // before the question is consumed, so a stray click can't cost anything.
    if (
      (currentChallenge._type === 'membership-challenge' ||
        currentChallenge._type === 'treaty-challenge') &&
      'isoCode' in eventData.submittedAnswer &&
      !currentChallenge.lineup.includes(eventData.submittedAnswer.isoCode)
    ) {
      return console.warn(`Answer outside the lineup — ignoring`)
    }

    player.resolving = true

    // The shared verdict throws on an answer/question shape mismatch, exiting
    // before the question is consumed — see the guard note above.
    const correct = isCorrectFinalAnswer({
      challenge: currentChallenge,
      submittedAnswer: eventData.submittedAnswer,
      pool: playableCountries(game),
    })

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
        scheduleMovementPhase(
          5000,
          { io, redis, socket, eventTarget },
          { continuation: true, walkSeq: player.walkSeq }
        )
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
      scheduleMovementPhase(
        0,
        { io, redis, socket, eventTarget },
        { continuation: true, walkSeq: player.walkSeq }
      )
    }

    // Pace the reveal: the client shows its own result beat first, then the
    // next question (or victory) lands. The pause runs OUTSIDE the queue. The
    // follow-up re-enters the queue to CLEAR the `resolving` latch (with a
    // fresh fetch) before emitting, so the next genuine answer — which can only
    // come after this reveal — is accepted while duplicates fired during the
    // pause were already rejected.
    scheduleGameTask({ redis, gameId: eventTarget.gameId }, 5000, async () => {
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
  },
  { player: 'warn' }
)
