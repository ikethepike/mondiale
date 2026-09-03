import { getRoundChallenge } from '~~/lib/challenges'
import { defineGameHandler } from '../server-side'
import { scheduleGameTask } from './deferred-task'
import { isAtlasChallenge, scheduleAtlasTimeout, startAtlasClock } from './atlas-turns'
import { isBorderChainChallenge, scheduleChainTimeout, startChainClock } from './chain-turns'
import {
  isHeritageHuntChallenge,
  scheduleHeritageTimeout,
  startHeritageClock,
} from './heritage-beats'
import { isTimelineChallenge, scheduleTimelineTimeout, startTimelineClock } from './timeline-turns'
import { isManhuntChallenge, scheduleManhuntTimeout, startManhunt } from './manhunt-beats'
import {
  isGovernmentChallenge,
  scheduleGovernmentTimeout,
  startGovernment,
} from './government-beats'
import { isUniqueOrBustChallenge, scheduleUniqueTimeout } from './unique-beats'
import { isCleanSweepChallenge, scheduleSweepTimeout } from './sweep-beats'
import { scheduleTerraTimeout } from './terra-beats'
import { scheduleClassicSettle, startClassicClock } from './classic-rounds'
import { armFinalQuestionCap, armIndividualGateCap } from './seat-exits'

import type { GameServer, GameSocket } from '../server-side'
import type { Redis } from '@upstash/redis'
import type { ClientEventTarget } from '~~/types/events.types'
import type { Player } from '~~/types/player.type'
import { isChallengeOfType, latestRound } from '~~/lib/rounds'
import { moveStopTile } from '~~/lib/player-status'
import {
  GATE_RESULT_WIRE_GRACE_MS,
  NEW_ROUND_PAUSE_MS,
  ROUND_BOUND_PHASES,
  SETTLED_PHASES,
  STEP_INTERVAL_MS,
  STEP_LATCH_SLACK_MS,
  WALK_LEAD_MS,
  WALK_RESUME_LEAD_MS,
} from '~~/lib/round-beats'

/**
 * Backstop for a table that is ready to advance but has nobody left to ask.
 *
 * Round staging only happens inside this handler. The scorecard's close is
 * the one client-driven entry (acked and retried), and the scores cap walks
 * an unresponsive seat — but a seat that settles while the table still
 * waits on others has NO live timer left pointed at the advancement check,
 * and a lost final entry would freeze the room on "Finished this turn".
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
  scheduleGameTask({ redis: ctx.redis, gameId: ctx.eventTarget.gameId }, delay, () =>
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
}

export const enterMovementPhaseHandler = defineGameHandler(
  'enter-movement-phase',
  async ({ game, player, server, eventData, eventTarget, io, redis, socket }) => {
    // The scorecard is the ONLY legitimate client entry point: everything
    // else that moves a seat (gate resumes, caps, heals, the watchdog, the
    // walk's own steps) re-enters as a server-originated continuation, which
    // bypasses the wire middleware — a client cannot forge one. This one
    // guard covers the old duplicate-while-moving case AND stray/replayed
    // client events landing on gates or settled seats.
    if (!eventData.continuation && player.phase !== 'group-scores') {
      return console.warn(
        `Ignoring enter-movement-phase from phase '${player.phase}' for ${eventTarget.playerId}`
      )
    }

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

    // The result beat's OWN token: walkSeq bumps only per walk, so a browse
    // hold's tick can outlive its beat and land during the NEXT gate's beat
    // on the same walk. A live stamp means a newer beat owns this seat — the
    // straggler dies; the beat's own ender fires past its stamp (the wire
    // grace absorbs timer jitter), and an early resume clears the stamp
    // before it schedules.
    if (
      eventData.continuation &&
      player.resultBeatUntil &&
      Date.now() < player.resultBeatUntil - GATE_RESULT_WIRE_GRACE_MS
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
    // challenge answer latch (and the beat's stamp) so the next gate accepts
    // a genuine answer. Only when this entry actually walks/settles the seat
    // — a stray tick hitting a settled or round-bound seat must not re-open
    // the duplicate-submit window. (Duplicates that race a live resume are
    // still killed by the phase guard and the submit's gate-tile echo.)
    if (!alreadySettled) {
      player.resolving = false
      player.resultBeatUntil = undefined
    }

    const move = player.moves[0]

    // Walk by position, not a pre-counted loop: a pre-counted loop deals a
    // permanent 'moving' wedge when there is nothing left to walk (gate
    // directly ahead), and can't resume if a walk is interrupted mid-way.
    // Challenge moves stop on the tile before their gate.
    if (alreadySettled) {
      // Skip the walk/settle block — go straight to the round-advancement check.
    } else if (move || player.walkIntro) {
      const stopAt = move ? moveStopTile(move) : player.currentPosition
      const tilesRemain = player.currentPosition < stopAt

      // THE WALK PROTOCOL: every walk — client- or server-initiated — first
      // ANNOUNCES (phase 'moving' rides its own snapshot so the stage is on
      // screen), lets the lead pass, then steps. A turn-opening walk
      // (walkIntro, stamped by startWalk) leads long enough for the "On the
      // move!" beat; a between-gates resume leads only a view transition —
      // the gate verdict was its announcement. A zero-tile opening still
      // announces ("your pawn stays put" is a real beat); the no-walk leap
      // resume (no intro, nothing to walk) settles below with NO phase flip,
      // which the gate shell's deferred relatch depends on.
      if (player.phase !== 'moving' && (player.walkIntro || tilesRemain)) {
        player.phase = 'moving'
        await server.updateGameState(game)
        server.emit({ event: 'update', game }, eventTarget)
        scheduleMovementPhase(
          player.walkIntro ? WALK_LEAD_MS : WALK_RESUME_LEAD_MS,
          { io, redis, socket, eventTarget },
          { continuation: true, walkSeq: player.walkSeq }
        )
        return
      }

      // Still tiles to walk: advance ONE step and hand the queue back. The
      // pace to the next step runs OUTSIDE the queue (via reschedule), so a
      // slow walker never blocks other players' events for this game.
      if (move && tilesRemain) {
        // The single-stepper latch: duplicate continuations for the SAME walk
        // (a rejoin re-armed a resume beside the live timer) both pass the
        // walkSeq guard, and two chains would step the pawn at double pace.
        // A tick landing early against the last step is the duplicate — drop
        // it WITHOUT rescheduling and the surviving chain keeps the cadence.
        const now = Date.now()
        if (player.lastStepAt && now - player.lastStepAt < STEP_INTERVAL_MS - STEP_LATCH_SLACK_MS) {
          return
        }

        player.currentPosition++
        player.lastStepAt = now
        // The first step ends the intro: later announces on this walk are
        // resumes and take the short lead.
        player.walkIntro = false
        await server.updateGameState(game)
        server.emit({ event: 'update', game }, eventTarget)

        scheduleMovementPhase(
          STEP_INTERVAL_MS,
          { io, redis, socket, eventTarget },
          { continuation: true, walkSeq: player.walkSeq }
        )
        return
      }

      // Arrived at the stop tile (or a zero-tile opening) — settle the move.
      player.walkIntro = false
      if (move?.challenge) {
        player.phase = move.challenge._type
      } else {
        player.phase = 'movement-summary'
        // The move is fully walked — clearing it keeps clients from reading a
        // stale currentMove between rounds
        player.moves = []
      }
      await server.updateGameState(game)
      server.emit({ event: 'update', game }, eventTarget)
      // A gate only a submit resolves gets its server-owned cap the moment
      // the seat lands on it.
      if (move?.challenge?._type === 'individual-challenge') {
        armIndividualGateCap({ io, redis, socket, eventTarget }, player)
      }
      if (move?.challenge?._type === 'final-challenge') {
        armFinalQuestionCap({ io, redis, socket, eventTarget }, player)
      }
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
        NEW_ROUND_PAUSE_MS,
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
      const revealedRound = latestRound(game)
      const revealed = revealedRound?.groupChallenge
      if (isBorderChainChallenge(revealed)) startChainClock(revealed)
      if (isAtlasChallenge(revealed)) startAtlasClock(revealed)
      if (isHeritageHuntChallenge(revealed)) startHeritageClock(revealed)
      if (isTimelineChallenge(revealed)) startTimelineClock(revealed)

      // Everything else is a classic round: the SAME contract, one level up —
      // the play window stamps onto the round itself, and the settle backstop
      // banks whoever never answers.
      if (revealedRound) startClassicClock(revealedRound)
      // Manhunt's start is async: the despot's trail seeds into its secret
      // redis blob (never the snapshot) before the reveal saves.
      if (isManhuntChallenge(revealed)) {
        await startManhunt({ io, redis, socket, eventTarget }, game, revealed)
      }
      // Government's start is async for the same reason: its answers move into
      // a redis side key before the reveal saves, so they never ride a
      // broadcast the whole room can read.
      if (isGovernmentChallenge(revealed)) {
        await startGovernment({ io, redis, socket, eventTarget }, game, revealed)
      }
      await server.updateGameState(game)
      server.emit({ event: 'new-round', game }, eventTarget)
      if (isBorderChainChallenge(revealed)) {
        scheduleChainTimeout({ io, redis, socket, eventTarget }, revealed)
      }
      if (isAtlasChallenge(revealed)) {
        scheduleAtlasTimeout({ io, redis, socket, eventTarget }, revealed)
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
      if (isGovernmentChallenge(revealed) && !revealed.state.finished) {
        scheduleGovernmentTimeout({ io, redis, socket, eventTarget }, revealed)
      }
      // Unique or Bust opens on its briefing (deadline stays 0) — this arms
      // the reading cap; the writing clock stamps when the table is briefed.
      if (isUniqueOrBustChallenge(revealed)) {
        scheduleUniqueTimeout({ io, redis, socket, eventTarget }, game, revealed)
      }
      // Clean Sweep opens on its briefing too (deadline stays 0) — same seam,
      // same reading cap; the board's clock stamps when the table is briefed.
      if (isCleanSweepChallenge(revealed)) {
        scheduleSweepTimeout({ io, redis, socket, eventTarget }, game, revealed)
      }
      // Terra Incognita opens on its briefing as well: the classic clock
      // refused to stamp above, and the last ready (or this cap) stamps it.
      if (isChallengeOfType(revealed, 'terra-incognita-challenge')) {
        scheduleTerraTimeout({ io, redis, socket, eventTarget }, game, revealed)
      }
      scheduleClassicSettle({ io, redis, socket, eventTarget }, game)
    }
  }
)
