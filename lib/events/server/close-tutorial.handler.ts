import { defineGameHandler } from '../server-side'
import { currentManhunt, scheduleManhuntTimeout, startManhunt } from './manhunt-beats'

export const closeTutorialHandler = defineGameHandler(
  'close-tutorial',
  async ({ game, player, server, eventTarget, io, redis, socket }) => {
    player.phase = 'group-challenge'

    // A manhunt dealt as round 1 (FORCE_ROUND_TYPE — natural round 1 is always
    // ranking) never passes the enter-movement-phase reveal, so its secret
    // blob seeds here instead. Every close during the briefing re-enters
    // (the deadline stays 0 until the pursuit begins) — startManhunt is
    // idempotent on the secret, so only the first close seeds.
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
