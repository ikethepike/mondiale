import { playableCountries } from '~~/lib/game-rules'
// Type-only, all of it: `FinalChallengeItem`/`FinalChallengeAnswer` are erased
// at compile, so the beat adds no runtime edge into lib/challenges —
// the deferred-import discipline that keeps the Nitro build under CI's heap.
import type {
  FinalChallenge,
  FinalChallengeAnswer,
  FinalChallengeItem,
} from '~~/types/challenges/final-challenge.type'
import type { ClientEventTarget, ServerEventData } from '~~/types/events.types'
import { latestRound } from '~~/lib/rounds'
import type { Game } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { defineGameHandler, RetryableReject } from '../server-side'
import { scheduleMovementPhase } from './enter-movement-phase.handler'
import { clearFinalResultBeat } from './seat-exits'
import { FINAL_REVEAL_HOLD_MS, GATE_RESULT_HOLD_MS } from '~~/lib/round-beats'

/**
 * The gauntlet's verdict on the wire.
 *
 * The snapshot cannot carry it: `lives` deliberately stays at its PRE-answer
 * value through `FINAL_REVEAL_HOLD_MS` so the answering player's optimistic
 * heart-break isn't undone mid-reveal. That leaves everyone ELSE — a watcher
 * in the booth, a player parked on the board — with no way to learn what
 * happened until the next question lands. This beat is that fact, stamped at
 * the moment the server graded it.
 *
 * Emitted from the server's grading points, never relayed from the answering
 * client: bots call the submit handler directly (bot-brain's
 * `dispatchFinalAnswer`) and the AFK autopilot routes human seats through the
 * same brain, so a client-side relay would go silent for exactly the runs
 * nobody is sitting in front of.
 */
export const emitFinalBeat = (
  server: { emit: (data: ServerEventData, target: ClientEventTarget) => void },
  eventTarget: ClientEventTarget,
  beat: {
    playerId: string
    turn: number
    correct: boolean
    timedOut: boolean
    challenge: FinalChallengeItem
    submittedAnswer?: FinalChallengeAnswer
    gauntlet: Pick<FinalChallenge, 'lives' | 'answeredCorrect' | 'totalCount'>
    knockedOut: boolean
  }
) => {
  const { gauntlet, ...rest } = beat
  server.emit(
    {
      event: 'final-beat',
      ...rest,
      lives: gauntlet.lives,
      answeredCorrect: gauntlet.answeredCorrect,
      totalCount: gauntlet.totalCount,
      entryId: `final:${beat.playerId}:${beat.turn}`,
      at: Date.now(),
    },
    eventTarget
  )
}

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
  player,
}: {
  game: Game
  gauntlet: FinalChallenge
  player: Player
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
  if (!survives) {
    // The knockout's durable trace, the forfeitGate posture with zero
    // forfeited steps: it licenses the board's descent-off-the-mountain
    // retreat (the display guard only plays retreats against a blocked
    // record) and marks the run's end in the round history.
    const turn = latestRound(game)?.playerTurns[player.id]
    if (turn) {
      turn.blocked = { atTile: game.tiles.length - 1, forfeitedSteps: 0 }
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
      // Retryable, not a dead duplicate: a post-reload answer to the NEXT
      // question lands inside this hold too. The retry outlasts the hold; a
      // true duplicate then dies on its stale `turn` echo instead.
      throw new RetryableReject('resolving')
    }

    // Staleness echo, like the gates' `gateTile`: an answer that lost the
    // race with the question cap (or any redeal) must not be graded against
    // a question the player never saw.
    if (eventData.turn !== undefined && eventData.turn !== (currentMove.challenge.turn ?? 0)) {
      return console.warn(
        `Ignoring final submit for turn ${eventData.turn} — the gauntlet is on turn ${currentMove.challenge.turn ?? 0}`
      )
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
    // The turn this answer resolves — read BEFORE the mutation bumps it, so
    // the beat names the question that was actually on screen.
    const answeredTurn = gauntlet.turn ?? 0
    let knockedOut = false
    if (correct) {
      // Correct: the question is now consumed.
      gauntlet.turn = (gauntlet.turn ?? 0) + 1
      gauntlet.answeredCorrect += 1
      gauntlet.challenges.shift()
    } else {
      const { survives } = await applyFinalMiss({ game, gauntlet, player })
      knockedOut = !survives

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
        emitFinalBeat(server, eventTarget, {
          playerId: player.id,
          turn: answeredTurn,
          correct,
          timedOut: false,
          challenge: currentChallenge,
          submittedAnswer: eventData.submittedAnswer,
          gauntlet,
          knockedOut: true,
        })
        scheduleMovementPhase(
          GATE_RESULT_HOLD_MS,
          { io, redis, socket, eventTarget },
          { continuation: true, walkSeq: player.walkSeq }
        )
        return
      }
    }

    emitFinalBeat(server, eventTarget, {
      playerId: player.id,
      turn: answeredTurn,
      correct,
      timedOut: false,
      challenge: currentChallenge,
      submittedAnswer: eventData.submittedAnswer,
      gauntlet,
      knockedOut,
    })

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

    // Pace the reveal: the client shows its own result beat first, then the
    // next question (or victory) lands. The shared follow-up clears the
    // `resolving` latch (with a fresh fetch), reveals, and starts the next
    // question's cap — so the next genuine answer, which can only come after
    // this reveal, is accepted while duplicates fired during the pause were
    // already rejected.
    await clearFinalResultBeat({ io, redis, socket, eventTarget }, player)

    // The winner's advancement re-check rides the SAME hold, armed AFTER the
    // reveal task so it runs behind it: the reveal emit then carries the
    // pre-staging snapshot (a true seat+round slice) and the staged round
    // still travels only on `new-round`, 2s later.
    if (won) {
      scheduleMovementPhase(
        FINAL_REVEAL_HOLD_MS,
        { io, redis, socket, eventTarget },
        { continuation: true, walkSeq: player.walkSeq }
      )
    }
  },
  { player: 'warn' }
)
