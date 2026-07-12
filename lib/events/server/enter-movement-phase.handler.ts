import { getRoundChallenge } from '~~/lib/challenges'
import { defineGameHandler, enqueueGameTask } from '../server-side'
import {
  isBorderChainChallenge,
  scheduleChainTimeout,
  startChainClock,
} from './chain-turns'
import {
  isHeritageHuntChallenge,
  scheduleHeritageTimeout,
  startHeritageClock,
} from './heritage-beats'

import type { GameServer, GameSocket } from '../server-side'
import type { Redis } from '@upstash/redis'
import type { ClientEventTarget } from '~~/types/events.types'

/** Phases that no longer take part in a round's movement. */
const SETTLED_PHASES = ['movement-summary', 'victory', 'kicked']

const STEP_INTERVAL = 500
const NEW_ROUND_PAUSE = 2000

/**
 * Re-enter this handler through the per-game queue after `delay` ms. The timer
 * runs OUTSIDE the queue so the pause never holds the lock; the follow-up then
 * takes the lock, re-fetches fresh game state, and continues. `continuation`
 * marks the re-entry as the walk's own so it is not mistaken for a duplicate
 * external event and rejected. Mirrors the challenge handlers' pacing pattern.
 */
const rescheduleMovement = (
  delay: number,
  ctx: { io: GameServer; redis: Redis; socket: GameSocket; eventTarget: ClientEventTarget }
) => {
  setTimeout(() => {
    enqueueGameTask(ctx.eventTarget.gameId, () =>
      enterMovementPhaseHandler({
        io: ctx.io,
        redis: ctx.redis,
        socket: ctx.socket,
        eventTarget: ctx.eventTarget,
        eventKey: 'enter-movement-phase',
        eventData: { event: 'enter-movement-phase', continuation: true },
      })
    )
  }, delay)
}

export const enterMovementPhaseHandler = defineGameHandler(
  'enter-movement-phase',
  async ({ game, player, server, eventData, eventTarget, io, redis, socket }) => {
    // A duplicate external event while a walk is already in flight would start
    // a second stepping chain and double-advance the pawn. Only the walk's own
    // rescheduled continuations (continuation: true) are allowed to proceed
    // while the phase is 'moving'; anything else bails. Continuations are
    // server-originated — they bypass the wire middleware — so a client cannot
    // forge one to advance another player (Fix #1 already binds playerId).
    if (player.phase === 'moving' && !eventData.continuation) return

    // The result beat is over once movement resumes: clear the challenge
    // answer latch so the next gate accepts a genuine answer. (Set by the
    // submit-*-challenge-answer handlers; this is the individual challenge's
    // reveal follow-up — the final challenge clears its own.)
    player.resolving = false

    // A player who has already settled (won, was kicked, or finished their
    // turn) must NOT be re-walked or re-settled on re-entry — treat this as a
    // pure round-advancement re-check. The victory path re-enters here to make
    // someone recompute readyForNextTurn after a win (the winner reaches
    // victory outside this handler), which would otherwise strand everyone
    // else in movement-summary with no `new-round` ever fired.
    const alreadySettled = SETTLED_PHASES.includes(player.phase)

    const move = player.moves[0]

    // Walk by position, not a pre-counted loop: a pre-counted loop deals a
    // permanent 'moving' wedge when there is nothing left to walk (gate
    // directly ahead), and can't resume if a walk is interrupted mid-way.
    // Challenge moves stop on the tile before their gate.
    if (alreadySettled) {
      // Skip the walk/settle block — go straight to the round-advancement check.
    } else if (move) {
      const stopAt = move.challenge ? move.endTile.position - 1 : move.endTile.position

      // Still tiles to walk: advance ONE step and hand the queue back. The
      // +500ms pace to the next step runs OUTSIDE the queue (via reschedule),
      // so a slow walker never blocks other players' events for this game.
      if (player.currentPosition < stopAt) {
        player.phase = 'moving'
        player.currentPosition++
        await server.updateGameState(game)
        server.emit({ event: 'update', game }, eventTarget)

        rescheduleMovement(STEP_INTERVAL, { io, redis, socket, eventTarget })
        return
      }

      // Arrived at the stop tile — settle the move.
      if (move.challenge) {
        player.phase = move.challenge._type
      } else {
        player.phase = 'movement-summary'
        // The move is fully walked — clearing it keeps clients from reading a
        // stale currentMove between rounds
        player.moves = []
      }
      await server.updateGameState(game)
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

    // Stage the next round, then reveal it after a settle pause. The pause runs
    // outside the queue; a `pendingRoundStart` flag makes the staging and the
    // reveal each happen exactly once even though the follow-up re-enters here.
    if (readyForNextTurn && stillCompeting && !game.pendingRoundStart) {
      game.rounds.push({
        groupChallenge: await getRoundChallenge({ game }),
        groupAnswers: {},
        playerTurns: {},
      })
      game.pendingRoundStart = true
      await server.updateGameState(game)

      rescheduleMovement(NEW_ROUND_PAUSE, { io, redis, socket, eventTarget })
      return
    }

    // The staged round's settle pause has elapsed: flip the waiting players in
    // and reveal the round exactly once.
    if (game.pendingRoundStart && readyForNextTurn) {
      game.pendingRoundStart = false
      for (const entry of players) {
        // Winners stay on their victory screen
        if (entry.phase === 'movement-summary') entry.phase = 'group-challenge'
      }
      // The clocked rounds (Border Chain's shot clock, Heritage Hunt's beat
      // clock): stamp the first deadline into the snapshot being revealed,
      // and arm the timeout after the save.
      const revealed = game.rounds[game.rounds.length - 1]?.groupChallenge
      if (isBorderChainChallenge(revealed)) startChainClock(revealed)
      if (isHeritageHuntChallenge(revealed)) startHeritageClock(revealed)
      await server.updateGameState(game)
      server.emit({ event: 'new-round', game }, eventTarget)
      if (isBorderChainChallenge(revealed)) {
        scheduleChainTimeout({ io, redis, socket, eventTarget }, revealed)
      }
      if (isHeritageHuntChallenge(revealed)) {
        scheduleHeritageTimeout({ io, redis, socket, eventTarget }, revealed)
      }
    }
  }
)
