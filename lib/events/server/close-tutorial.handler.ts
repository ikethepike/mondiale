import { defineGameHandler } from '../server-side'
import { currentBorderChain, scheduleChainTimeout } from './chain-turns'
import { scheduleClassicSettle, startClassicClockOnLastClose } from './classic-rounds'
import { currentManhunt, scheduleManhuntTimeout, startManhunt } from './manhunt-beats'
import { currentUniqueOrBust, scheduleUniqueTimeout } from './unique-beats'

export const closeTutorialHandler = defineGameHandler(
  'close-tutorial',
  async ({ game, player, server, eventTarget, io, redis, socket }) => {
    // A seat the round already advanced (a settle banked it, the tutorial cap
    // beat the click) must not be dragged back into a spent round — a late
    // "Let's go" is a resync, not a phase change.
    if (player.phase !== 'tutorial') {
      return server.emit({ event: 'update', game }, eventTarget)
    }
    player.phase = 'group-challenge'

    // Round 1 never passes the enter-movement-phase reveal, so a classic
    // round's clock stamps here instead (the same seam the turn engines'
    // briefings use below) — on the close that empties the rules cards, so
    // no live reader's window starts under someone else's card. This seat's
    // phase already flipped above, so a solo table stamps on its own close.
    const startsClassicClock = startClassicClockOnLastClose(game)

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
    if (startsClassicClock) scheduleClassicSettle({ io, redis, socket, eventTarget }, game)

    // Same round-1 FORCE_ROUND_TYPE seam for Unique or Bust: its briefing cap
    // normally arms at the enter-movement-phase reveal, which round 1 never
    // passes. Re-arming on every close is the manhunt precedent — a stale cap
    // task bails on the briefing flag.
    const unique = currentUniqueOrBust(game)
    if (unique && !unique.state.finished && unique.state.briefing) {
      scheduleUniqueTimeout({ io, redis, socket, eventTarget }, game, unique)
    }

    // And for Border Chain's briefing, which holds its first shot clock the
    // same way (deadline 0 until the table is ready).
    const chain = currentBorderChain(game)
    if (chain && !chain.state.finished && chain.state.briefing) {
      scheduleChainTimeout({ io, redis, socket, eventTarget }, chain)
    }
  }
)
