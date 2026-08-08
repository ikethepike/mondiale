import { playableCountries } from '~~/lib/game-rules'
import type { FinalChallenge } from '~~/types/challenges/final-challenge.type'
import type { Game } from '~~/types/game.types'
import { defineGameHandler } from '../server-side'
import { scheduleMovementPhase } from './enter-movement-phase.handler'
import { clearFinalResultBeat } from './seat-exits'
import { GATE_RESULT_HOLD_MS } from '~~/lib/round-beats'

/**
 * One missed question, one shape: burn a life and advance (a missed LAST
 * question is replaced, never skipped — victory must end on a correct
 * answer), or report the run is over. Shared by the wrong-answer branch
 * below and the gauntlet's question cap (seat-exits.ts). Bumps the
 * gauntlet's turn token; the caller owns the save and what follows a
 * knockout.
 */
export const applyFinalMiss = async ({
  game,
  gauntlet,
}: {
  game: Game
  gauntlet: FinalChallenge
}): Promise<{ survives: boolean }> => {
  const { dealReplacementChallenge } = await import('~~/lib/challenges/final-challenge')
  const currentChallenge = gauntlet.challenges[0]
  gauntlet.turn = (gauntlet.turn ?? 0) + 1
  let survives = gauntlet.lives > 0
  if (survives) {
    gauntlet.lives -= 1
    if (gauntlet.challenges.length > 1) {
      gauntlet.challenges.shift()
    } else if (currentChallenge) {
      const replacement = dealReplacementChallenge({
        game,
        exclude: [currentChallenge._type],
      })
      if (replacement) gauntlet.challenges[0] = replacement
      else survives = false
    }
  }
  return { survives }
}

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
    const { isCorrectFinalAnswer } = await import('~~/lib/challenges/final-challenge')

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
      gauntlet.turn = (gauntlet.turn ?? 0) + 1
      gauntlet.answeredCorrect += 1
      gauntlet.challenges.shift()
    } else {
      const { survives } = await applyFinalMiss({ game, gauntlet })

      // Out of lives: knocked out of the gauntlet. The result pause runs
      // OUTSIDE the per-game queue — holding the lock for five seconds would
      // stall every other player — and the follow-up re-enters through the
      // queue with a fresh game fetch.
      if (!survives) {
        player.moves = []
        await server.updateGameState(game)
        // The knockout verdict must reach the client NOW — with no emit the
        // view sits on its last frame for the whole result pause, and the
        // shell's wire-grace fallback ends up carrying the primary case.
        server.emit({ event: 'final-challenge-checked', game }, eventTarget)
        scheduleMovementPhase(
          GATE_RESULT_HOLD_MS,
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
    // `new-round` that would never fire. Re-enter the movement phase (which
    // now skips settled players and only runs the advancement check) so it
    // stages and reveals the next round for the remaining players — BEHIND
    // the winner's own result beat, or the staged round's `new-round` full
    // snapshot can land before the victory beat it should follow.
    if (won) {
      scheduleMovementPhase(
        GATE_RESULT_HOLD_MS,
        { io, redis, socket, eventTarget },
        { continuation: true, walkSeq: player.walkSeq }
      )
    }

    // Pace the reveal: the client shows its own result beat first, then the
    // next question (or victory) lands. The shared follow-up clears the
    // `resolving` latch (with a fresh fetch), reveals, and starts the next
    // question's cap — so the next genuine answer, which can only come after
    // this reveal, is accepted while duplicates fired during the pause were
    // already rejected.
    await clearFinalResultBeat({ io, redis, socket, eventTarget }, eventTarget.playerId)
  },
  { player: 'warn' }
)
