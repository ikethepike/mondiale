import { defineGameHandler } from '../server-side'
import { commitSeat, walkOut } from './seat-exits'

/**
 * The scorecard's Continue: the one client-driven way onto the board. Every
 * later beat of the walk is a seat timer reading the cursor's own stamps.
 */
export const enterMovementPhaseHandler = defineGameHandler(
  'enter-movement-phase',
  async ({ game, player, server, eventData, eventTarget }) => {
    if (player.cursor.step !== 'scores' || eventData.subject !== player.cursor.subject) {
      return server.emit({ event: 'update', game }, eventTarget)
    }
    walkOut(game, player, 'event:enter-movement-phase')
    await commitSeat(server, game, player)
  }
)
