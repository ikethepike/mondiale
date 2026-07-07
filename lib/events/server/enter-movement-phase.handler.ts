import { getRoundChallenge } from '~~/lib/challenges'
import { wait } from '~~/lib/time'
import { defineGameHandler } from '../server-side'

/** Phases that no longer take part in a round's movement. */
const SETTLED_PHASES = ['movement-summary', 'victory', 'kicked']

export const enterMovementPhaseHandler = defineGameHandler(
  'enter-movement-phase',
  async ({ game, player, server, eventTarget }) => {
    // Duplicate events would start a second stepping loop and double-advance
    if (player.phase === 'moving') return

    // Defer movement logic to the server
    // Find all moves that we currently can do, move up player to the point and check tile
    const move = player.moves[0]
    if (move) {
      player.phase = 'moving'

      for (const index of [...Array(move.steps).keys()]) {
        const isLastStep = index + 1 === move.steps

        await wait(500)
        if (isLastStep && move.challenge) {
          player.phase = move.challenge._type
        } else if (isLastStep) {
          // player has no additional steps and the turn has not ended
          player.phase = 'movement-summary'
          // The move is fully walked — clearing it keeps clients from
          // reading a stale currentMove between rounds
          player.moves = []
        } else {
          player.currentPosition++
        }
        server.emit({ event: 'update', game }, eventTarget)
      }
    } else {
      player.phase = 'movement-summary'
      await server.updateGameState(game)
      server.emit({ event: 'update', game }, eventTarget)
    }

    // Players who already won (or were kicked) can't reach movement-summary —
    // counting them as settled keeps the game moving for everyone else
    const players = Object.values(game.players)
    const readyForNextTurn = players.every(entry => SETTLED_PHASES.includes(entry.phase))
    const stillCompeting = players.some(entry => entry.phase === 'movement-summary')

    if (readyForNextTurn && stillCompeting) {
      game.rounds.push({
        groupChallenge: getRoundChallenge({ game }),
        groupAnswers: {},
        playerTurns: {},
      })

      await wait(2000)

      for (const entry of Object.values(game.players)) {
        // Winners stay on their victory screen
        if (entry.phase === 'movement-summary') entry.phase = 'group-challenge'
      }

      await server.updateGameState(game)
      server.emit({ event: 'new-round', game }, eventTarget)
    } else {
      await server.updateGameState(game)
    }
  }
)
