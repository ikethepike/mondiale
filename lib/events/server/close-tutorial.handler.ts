import { defineGameHandler } from '../server-side'
import { currentManhunt, scheduleManhuntTimeout, startManhunt } from './manhunt-beats'

export const closeTutorialHandler = defineGameHandler(
  'close-tutorial',
  async ({ game, player, server, eventTarget, io, redis, socket }) => {
    player.phase = 'group-challenge'

    // A manhunt dealt as round 1 (FORCE_ROUND_TYPE — natural round 1 is always
    // ranking) never passes the enter-movement-phase reveal, so its secret
    // blob and clock start here instead, on the FIRST tutorial close. The
    // per-game queue serializes closes; the deadline guard makes later ones
    // no-ops.
    const manhunt = currentManhunt(game)
    const startsManhunt = manhunt && !manhunt.state.finished && manhunt.state.deadline === 0
    if (startsManhunt) {
      await startManhunt({ io, redis, socket, eventTarget }, game, manhunt)
    }

    await server.updateGameState(game)
    server.emit({ event: 'update', game }, eventTarget)
    if (startsManhunt && !manhunt.state.finished) {
      scheduleManhuntTimeout({ io, redis, socket, eventTarget }, manhunt)
    }
  }
)
