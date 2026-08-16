import { defineGameHandler } from '../server-side'
import { scheduleMovementPhase } from './enter-movement-phase.handler'

/**
 * A browsable gate reveal's explicit exit: resume the walk now instead of
 * waiting out the browse cap.
 *
 * Three guards, each load-bearing: the seat must be ON an individual gate
 * (`resolving` alone is ALSO the final gauntlet's duplicate-submit latch — a
 * late-flushed Continue must never clear that mid-hold), the latch must be
 * up (a mid-question send is refused, keeping the gate-skip surface closed),
 * and the beat's stamp must be live (only individual submits stamp it, so a
 * gauntlet seat can never qualify even if its phase were misread). The stamp
 * is cleared AND SAVED before the resume is scheduled — the movement
 * handler's stale-tick guard would otherwise kill the resume itself.
 *
 * The still-armed browse-cap continuation then lands against a cleared stamp
 * on a walked seat and dies on the phase guard; one that instead crosses
 * into a LATER gate's beat dies on that beat's own live stamp.
 */
export const gateRevealDoneHandler = defineGameHandler(
  'gate-reveal-done',
  async ({ game, player, server, eventTarget, io, redis, socket }) => {
    if (player.phase !== 'individual-challenge') return
    if (!player.resolving || !player.resultBeatUntil) return

    player.resultBeatUntil = undefined
    await server.updateGameState(game)

    scheduleMovementPhase(
      0,
      { io, redis, socket, eventTarget },
      { continuation: true, walkSeq: player.walkSeq }
    )
  }
)
