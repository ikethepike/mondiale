import { latestRound } from '~~/lib/rounds'
import { revealHoldMsFor } from '~~/lib/round-beats'
import { defineGameHandler } from '../server-side'
import { scheduleRevealFlip } from './classic-rounds'
import { gradeGroupAnswer } from './grade-group-answer'
import { advanceScoredSeat } from './round-engine'
import { armGroupScoresCap } from './seat-exits'
import { startWalk } from './moves'

export const submitGroupChallengeAnswersHandler = defineGameHandler(
  'submit-group-challenge-answers',
  async ({ game, player, server, eventData, eventTarget, io, redis, socket }) => {
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
        await advanceScoredSeat(game, player, banked?.scored ?? 0)
        await server.updateGameState(game)
        server.emit({ event: 'group-challenge-scored', game }, eventTarget)
        return
      }
      return console.warn(`Duplicate round submission ignored for player: ${playerId}`)
    }

    const { scoring, answer } = await gradeGroupAnswer({
      game,
      round: currentRound,
      playerId,
      submission: eventData,
    })
    currentRound.groupAnswers[playerId] = answer

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

    // Kinds with a reveal beat keep the seat in the challenge while the view
    // plays its (display-only) reveal — the server owns the beat's end via
    // the flip task. Everything else advances inline, exactly as before.
    const hold = revealHoldMsFor(currentRound.groupChallenge)
    if (hold) {
      await server.updateGameState(game)
      server.emit({ event: 'group-challenge-scored', game }, eventTarget)
      scheduleRevealFlip({ io, redis, socket, eventTarget }, game, playerId)
      return
    }

    await advanceScoredSeat(game, player, scoring.scored)

    await server.updateGameState(game)
    server.emit({ event: 'group-challenge-scored', game }, eventTarget)
    armGroupScoresCap({ io, redis, socket, eventTarget }, player)
  }
)
