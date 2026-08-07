import { latestRound } from '~~/lib/rounds'
import { defineGameHandler } from '../server-side'
import { gradeGroupAnswer } from './grade-group-answer'
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

    player.phase = 'group-scores'
    startWalk(player, await movesForScoredPoints({ game, player, scored: scoring.scored }))

    await server.updateGameState(game)
    server.emit({ event: 'group-challenge-scored', game }, eventTarget)
  }
)
