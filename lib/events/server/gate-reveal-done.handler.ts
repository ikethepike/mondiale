import { defineGameHandler } from '../server-side'
import { scheduleMovementPhase } from './enter-movement-phase.handler'

/**
 * A browsable gate reveal's explicit exit: resume the walk now instead of
 * waiting out the browse cap. Only meaningful while the seat's `resolving`
 * latch is up — the server-visible result-beat token, set by the submit and
 * cleared only by the movement resume — so a mid-question send is refused
 * outright and the gate-skip surface stays closed. The cap's own continuation
 * firing after this early resume is a designed no-op: the 'moving' phase
 * guard and the single-stepper latch absorb duplicate continuations.
 */
export const gateRevealDoneHandler = defineGameHandler(
  'gate-reveal-done',
  async ({ game, eventTarget, io, redis, socket }) => {
    const player = game.players[eventTarget.playerId]
    if (!player?.resolving) return

    scheduleMovementPhase(
      0,
      { io, redis, socket, eventTarget },
      { continuation: true, walkSeq: player.walkSeq }
    )
  }
)
