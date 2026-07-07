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

      // Walk by position, not by a step count: a pre-counted loop deals a
      // permanent 'moving' wedge when there is nothing left to walk (gate
      // directly ahead), and can't resume if a walk is interrupted mid-way.
      // Challenge moves stop on the tile before their gate.
      const stopAt = move.challenge ? move.endTile.position - 1 : move.endTile.position
      while (player.currentPosition < stopAt) {
        await wait(500)
        player.currentPosition++
        server.emit({ event: 'update', game }, eventTarget)
      }

      await wait(500)
      if (move.challenge) {
        player.phase = move.challenge._type
      } else {
        player.phase = 'movement-summary'
        // The move is fully walked — clearing it keeps clients from
        // reading a stale currentMove between rounds
        player.moves = []
      }
      server.emit({ event: 'update', game }, eventTarget)
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
