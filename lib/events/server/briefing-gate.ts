import type { Game } from '~~/types/game.types'
import type { GameServerEvent } from '~~/types/events.types'
import { useServerSideEvents } from '../server-side'
import type { EngineContext } from './round-engine'

/**
 * The click-away rules card four modes now open on (border chain, atlas,
 * manhunt, unique or bust, clean sweep). One gate, one set of rules:
 *
 *  • a ready push is idempotent, and only a PARTICIPANT may push;
 *  • the last ready opens the round — the caller's `begin` owns what that
 *    means (stamp a deadline, seed a secret, arm a clock);
 *  • anything short of the last ready is a save and a whole-table emit, so
 *    every seat's ready-row repaints.
 *
 * The cap that force-starts a table which never all clicks stays with each
 * engine's `schedule*Timeout`: it is armed off the same state token the rest
 * of that engine's timers are, and splitting it out here would put half a
 * mode's staleness reasoning in two files.
 */
export interface BriefingGateState {
  briefing?: boolean
  ready: string[]
}

/**
 * The generic per-seat ack collector BOTH gate shapes ride — the briefing
 * cards ("everyone read the rules, begin") and the timeline's browsable
 * reveal ("everyone read the chronicle, settle"). One collector, so a fix
 * to its rules (idempotent pushes, participant-only, last-ack completion,
 * whole-table repaints short of it) reaches every ack surface at once.
 */
export const applyGateAck = async ({
  ctx,
  game,
  playerId,
  participants,
  event,
  open,
  acked,
  complete,
}: {
  ctx: EngineContext
  game: Game
  playerId: string
  /** Whose acks the gate waits on — the round's own seats, never the
   *  room's (a watcher and a kicked id must not hold the table). */
  participants: readonly string[]
  /** The mode's whole-table update event. */
  event: GameServerEvent['event']
  /** The gate accepts acks (briefing still up / settle still unmarked). */
  open: () => boolean
  /** The persisted ack array — `ready`, `revealDone`. */
  acked: string[]
  /** The last ack's exit — begin the round, settle the table. */
  complete: () => Promise<void>
}): Promise<void> => {
  if (!open() || acked.includes(playerId)) return
  if (!participants.includes(playerId)) return
  acked.push(playerId)

  if (participants.every(id => acked.includes(id))) return complete()

  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event, game } as GameServerEvent, ctx.eventTarget)
}

export const applyBriefingReady = async <State extends BriefingGateState>({
  ctx,
  game,
  state,
  playerId,
  participants,
  event,
  begin,
}: {
  ctx: EngineContext
  game: Game
  state: State
  playerId: string
  /** Whose readiness the gate waits on — the round's own seats, never the
   *  room's (a watcher and a kicked id must not hold the table). */
  participants: readonly string[]
  /** The mode's whole-table update event. */
  event: GameServerEvent['event']
  begin: () => Promise<void>
}): Promise<void> =>
  applyGateAck({
    ctx,
    game,
    playerId,
    participants,
    event,
    open: () => !!state.briefing,
    acked: state.ready,
    complete: begin,
  })
