import { getRoundChallenge } from '~~/lib/challenges'
import { defineGameHandler, enqueueGameTask } from '../server-side'
import { isBorderChainChallenge, scheduleChainTimeout, startChainClock } from './chain-turns'
import {
  isHeritageHuntChallenge,
  scheduleHeritageTimeout,
  startHeritageClock,
} from './heritage-beats'
import { isTimelineChallenge, scheduleTimelineTimeout, startTimelineClock } from './timeline-turns'
import { isManhuntChallenge, scheduleManhuntTimeout, startManhunt } from './manhunt-beats'
import { isUniqueOrBustChallenge, scheduleUniqueTimeout } from './unique-beats'

import type { GameServer, GameSocket } from '../server-side'
import type { Redis } from '@upstash/redis'
import type { ClientEventTarget } from '~~/types/events.types'
import type { Player } from '~~/types/player.type'
import { latestRound } from '~~/lib/rounds'

/** Phases that no longer take part in a round's movement. */
export const SETTLED_PHASES = ['movement-summary', 'victory', 'kicked']

/** Phases that live INSIDE the round (or before the game): never walkable.
 *  Walking one ejects the seat to 'movement-summary' mid-round — the reveal
 *  flips seats to 'group-challenge' with `moves: []`, and a watchdog tick
 *  armed before the reveal (up to 8s earlier) lands exactly there. */
export const ROUND_BOUND_PHASES = ['naming', 'waiting-for-game', 'tutorial', 'group-challenge']

const STEP_INTERVAL = 500
const NEW_ROUND_PAUSE = 2000

/**
 * Backstop for a table that is ready to advance but has nobody left to ask.
 *
 * Round staging only happens inside this handler, and the only thing that
 * calls it after a scorecard is a CLIENT flag (`pendingMovementRequest`, set
 * in browser memory when the group-scores modal closes). A player who
 * refreshes, whose board chunk fails to load, or who closes scores at the
 * wrong moment drops that flag — and if they were the last seat the table
 * needed, the round never stages and the room freezes on "Finished this
 * turn" with every seat settled and no client willing to speak.
 *
 * So: whenever a seat settles without the table being ready, arm a
 * server-owned re-check. It re-enters this handler as a continuation, which
 * is idempotent — if a client got there first, `readyForNextTurn` and the
 * `pendingRoundStart` latch simply make it a no-op.
 *
 * Re-entry lands on the `alreadySettled` path, so each tick re-arms the next
 * one: a self-sustaining poll that survives every client going quiet. It is
 * bounded so a seat that is never coming back (closed tab, dead network)
 * cannot spin a timer for the life of the room.
 */
export const ADVANCE_WATCHDOG_MS = 8000
export const ADVANCE_WATCHDOG_MAX_TICKS = 40

/** Every seat has finished its turn — the table can stage the next round. */
export const tableIsSettled = (players: Pick<Player, 'phase'>[]): boolean =>
  players.every(entry => SETTLED_PHASES.includes(entry.phase))

/**
 * Should a settled seat arm the server-owned advance re-check? Only when the
 * seat itself is done but the table is not, and no round is already staged —
 * i.e. exactly the window where the missing client flag freezes the room.
 */
export const shouldArmAdvanceWatchdog = ({
  players,
  playerPhase,
  pendingRoundStart,
}: {
  players: Pick<Player, 'phase'>[]
  playerPhase: Player['phase']
  pendingRoundStart?: boolean
}): boolean =>
  SETTLED_PHASES.includes(playerPhase) && !tableIsSettled(players) && !pendingRoundStart

/**
 * Enter (or re-enter) the movement phase through the per-game queue after
 * `delay` ms. The timer runs OUTSIDE the queue so the pause never holds the
 * lock; the follow-up then takes the lock, re-fetches fresh game state, and
 * continues. `continuation` marks a re-entry as the walk's own so it is not
 * mistaken for a duplicate external event and rejected. The ONE way any
 * handler resumes movement — result beats, victory checks and rejoin healing
 * must not rebuild this call.
 */
export const scheduleMovementPhase = (
  delay: number,
  ctx: { io: GameServer; redis: Redis; socket: GameSocket; eventTarget: ClientEventTarget },
  options: { continuation?: boolean; watchdogTick?: number; walkSeq?: number } = {}
) => {
  setTimeout(() => {
    enqueueGameTask(ctx.eventTarget.gameId, () =>
      enterMovementPhaseHandler({
        io: ctx.io,
        redis: ctx.redis,
        socket: ctx.socket,
        eventTarget: ctx.eventTarget,
        eventKey: 'enter-movement-phase',
        eventData: {
          event: 'enter-movement-phase',
          ...(options.continuation ? { continuation: true } : {}),
          ...(options.watchdogTick ? { watchdogTick: options.watchdogTick } : {}),
          ...(options.walkSeq !== undefined ? { walkSeq: options.walkSeq } : {}),
        },
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

    // Staleness token: a continuation armed under an older walk generation is
    // a dead timer's tick (a watchdog re-check outliving its round, a result
    // beat outrun by a re-deal). Dropping it here is what makes arming the
    // same follow-up twice always safe.
    if (
      eventData.continuation &&
      eventData.walkSeq !== undefined &&
      eventData.walkSeq !== player.walkSeq
    ) {
      return
    }

    // A player who has already settled (won, was kicked, or finished their
    // turn) must NOT be re-walked or re-settled on re-entry — treat this as a
    // pure round-advancement re-check. The victory path re-enters here to make
    // someone recompute readyForNextTurn after a win (the winner reaches
    // victory outside this handler), which would otherwise strand everyone
    // else in movement-summary with no `new-round` ever fired.
    // A seat still IN the round (or pre-game) is equally unwalkable — a late
    // watchdog tick or a stray client event must not eject it mid-round.
    const alreadySettled =
      SETTLED_PHASES.includes(player.phase) || ROUND_BOUND_PHASES.includes(player.phase)

    // The result beat is over once movement resumes for a live seat: clear the
    // challenge answer latch so the next gate accepts a genuine answer. Only
    // when this entry actually walks/settles the seat — a stray tick hitting a
    // settled or round-bound seat must not re-open the duplicate-submit
    // window. (Duplicates that race a live resume are still killed by the
    // phase guard and the submit's gate-tile echo.)
    if (!alreadySettled) player.resolving = false

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

        scheduleMovementPhase(
          STEP_INTERVAL,
          { io, redis, socket, eventTarget },
          { continuation: true, walkSeq: player.walkSeq }
        )
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
    const readyForNextTurn = tableIsSettled(players)
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

      scheduleMovementPhase(
        NEW_ROUND_PAUSE,
        { io, redis, socket, eventTarget },
        { continuation: true, walkSeq: player.walkSeq }
      )
      return
    }

    // Settled, but the table isn't ready — the seats we're waiting on each owe
    // a client-flag-driven request that may never come (see
    // ADVANCE_WATCHDOG_MS). Arm a server-owned re-check so the round can stage
    // without one. Harmless when a client beats us here: re-entry is a
    // continuation and the checks above are already idempotent.
    if (
      shouldArmAdvanceWatchdog({
        players,
        playerPhase: player.phase,
        pendingRoundStart: game.pendingRoundStart,
      })
    ) {
      const tick = (eventData.watchdogTick ?? 0) + 1
      if (tick <= ADVANCE_WATCHDOG_MAX_TICKS) {
        scheduleMovementPhase(
          ADVANCE_WATCHDOG_MS,
          { io, redis, socket, eventTarget },
          { continuation: true, watchdogTick: tick, walkSeq: player.walkSeq }
        )
      } else {
        console.warn(
          `Round-advance watchdog gave up for ${eventTarget.gameId} after ${tick - 1} ticks; ` +
            `unsettled seats: ${players
              .filter(entry => !SETTLED_PHASES.includes(entry.phase))
              .map(entry => `${entry.name}:${entry.phase}`)
              .join(', ')}`
        )
      }
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
      const revealed = latestRound(game)?.groupChallenge
      if (isBorderChainChallenge(revealed)) startChainClock(revealed)
      if (isHeritageHuntChallenge(revealed)) startHeritageClock(revealed)
      if (isTimelineChallenge(revealed)) startTimelineClock(revealed)
      // Manhunt's start is async: the despot's trail seeds into its secret
      // redis blob (never the snapshot) before the reveal saves.
      if (isManhuntChallenge(revealed)) {
        await startManhunt({ io, redis, socket, eventTarget }, game, revealed)
      }
      await server.updateGameState(game)
      server.emit({ event: 'new-round', game }, eventTarget)
      if (isBorderChainChallenge(revealed)) {
        scheduleChainTimeout({ io, redis, socket, eventTarget }, revealed)
      }
      if (isHeritageHuntChallenge(revealed)) {
        scheduleHeritageTimeout({ io, redis, socket, eventTarget }, revealed)
      }
      if (isTimelineChallenge(revealed)) {
        scheduleTimelineTimeout({ io, redis, socket, eventTarget }, revealed)
      }
      if (isManhuntChallenge(revealed) && !revealed.state.finished) {
        scheduleManhuntTimeout({ io, redis, socket, eventTarget }, revealed)
      }
      // Unique or Bust opens on its briefing (deadline stays 0) — this arms
      // the reading cap; the writing clock stamps when the table is briefed.
      if (isUniqueOrBustChallenge(revealed)) {
        scheduleUniqueTimeout({ io, redis, socket, eventTarget }, game, revealed)
      }
    }
  }
)
