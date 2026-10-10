import { hasGame, type ServerEventData } from '~~/types/events.types'
import type { Game } from '~~/types/game.types'

/**
 * The client's snapshot ordering guard — the one home both the socket
 * dispatch gate and the protocol tests read, so the two cannot drift.
 *
 * The server's deferred tasks (settle backstops, reveal flips, seam caps)
 * fetch-and-emit outside the stepping chain's ordering, so a full snapshot
 * serialized BEFORE recent walk steps can land after them. Unguarded, that
 * replace regresses `currentPosition`/`moves` (the pawn re-walks ground it
 * already covered) or resurfaces a staged round with its latch cleared (the
 * next challenge's prompt flashes before the board). Dropping anything
 * strictly older closes every such window at the door.
 *
 * Strictly less, never less-or-equal: join full-syncs re-emit the last save
 * unchanged, so an equal rev must apply. A missing rev on either side applies
 * too — games saved before the field existed gain one on their next write.
 */
export const isStaleSnapshot = (current: Game | undefined, incoming: Game): boolean =>
  !!current &&
  current.id === incoming.id &&
  typeof current.rev === 'number' &&
  typeof incoming.rev === 'number' &&
  incoming.rev < current.rev

/**
 * Seat-slice appliers copy one player out of a full-breadth payload; adopting
 * the payload's rev afterwards keeps a LATER out-of-order full replace with a
 * lower rev droppable. (An older slice for another seat is then dropped and
 * that seat waits one emit — strictly better than applying it stale.)
 */
export const adoptRevision = (current: Game, incoming: Game): void => {
  if (incoming.rev !== undefined) current.rev = incoming.rev
}

/**
 * A seat slice may never move a seat's cursor backwards: an older slice for
 * that seat is a reordered or replayed emit, and applying it would put a
 * spent subject back on screen.
 */
export const isStaleSeat = (current: Game | undefined, incoming: Game, seatId: string): boolean => {
  const held = current?.players[seatId]?.cursor
  const offered = incoming.players[seatId]?.cursor
  return !!held && !!offered && current?.id === incoming.id && offered.seq < held.seq
}

/**
 * The dispatch gate: a FULL-REPLACE snapshot older than the one on screen is
 * dropped. The registry's `snapshotScope` exempts the two shapes that must
 * never be: the join full-sync (the recovery moment, and the one emit that can
 * carry a recreated room whose rev restarted) and seat slices (gated by the
 * seat's own `cursor.seq` instead).
 */
export const dropsSnapshot = (
  scope: 'authoritative' | 'seat-slice' | undefined,
  current: Game | undefined,
  payload: ServerEventData
): boolean => scope === undefined && hasGame(payload) && isStaleSnapshot(current, payload.game)
