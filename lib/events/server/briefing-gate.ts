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
}): Promise<void> => {
  if (!state.briefing || state.ready.includes(playerId)) return
  if (!participants.includes(playerId)) return
  state.ready.push(playerId)

  if (participants.every(id => state.ready.includes(id))) return begin()

  const server = useServerSideEvents(ctx)
  await server.updateGameState(game)
  server.emit({ event, game } as GameServerEvent, ctx.eventTarget)
}
