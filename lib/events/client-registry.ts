import { autopilotSummaryEvent } from '~~/lib/events/client/autopilot-summary.event'
import { joinRefusedEvent } from '~~/lib/events/client/join-refused.event'
import { tableNoticeEvent } from '~~/lib/events/client/table-notice.event'
import { genericUpdateEvent } from '~~/lib/events/client/generic-update.event'
import { groupChallengeScoredEvent } from '~~/lib/events/client/group-challenge-scored.event'
import { indexUpdateEvent } from '~~/lib/events/client/index-update.event'
import { manhuntPositionEvent } from '~~/lib/events/client/manhunt-position.event'
import { manhuntTauntEvent } from '~~/lib/events/client/manhunt-taunt.event'
import { playerCheeringEvent } from '~~/lib/events/client/player-cheering.event'
import { playerGuessingEvent } from '~~/lib/events/client/player-guessing.event'
import { playerUpdateEvent } from '~~/lib/events/client/player-update.event'
import type { useGameStore } from '~~/store/game.store'
import type { ClientEventTarget, ServerEventData } from '~~/types/events.types'

export type ClientSideEventHandler = (data: {
  eventKey: ServerEventData['event']
  payload: ServerEventData
  gameStore: ReturnType<typeof useGameStore>
  eventTarget: ClientEventTarget
  playerId: string
}) => void

/**
 * THE event->applier registry: which client-side applier consumes each server
 * event. One home, exported, so the emit-breadth convergence harness derives
 * its mirror from THIS object (by handler identity) instead of a hand-kept
 * copy — the copy had already drifted on 'final-challenge-checked', silently
 * voiding the harness for the gauntlet family. The socket plugin subscribes
 * from here; adding an event without an applier is a compile error.
 */
export const CLIENT_SIDE_EVENT_HANDLERS: {
  [key in ServerEventData['event']]: {
    handler: ClientSideEventHandler
    /**
     * How the rev-ordering gate treats this event's snapshot.
     *
     * `authoritative`: NEVER dropped — a join full-sync is the recovery
     * moment by definition, and it is the one emit that can carry a
     * RECREATED game (same room id, rev restarted at 1); gating it would
     * wedge every rejoining client forever. `seat-slice`: never dropped
     * either — the applier copies one seat out of a full-breadth payload,
     * and dropping an older slice for a DIFFERENT seat after adopting a
     * newer rev could discard that seat's only phase flip (slices are FIFO
     * per seat on the socket, so applying is always at least as fresh).
     * Absent: a full replace, dropped when strictly older than the store.
     */
    snapshotScope?: 'authoritative' | 'seat-slice'
  }
} = {
  'player-joined': {
    handler: genericUpdateEvent,
    snapshotScope: 'authoritative',
  },
  'name-set': {
    handler: playerUpdateEvent,
    snapshotScope: 'seat-slice',
  },
  'color-set': {
    handler: playerUpdateEvent,
    snapshotScope: 'seat-slice',
  },
  'game-started': {
    handler: genericUpdateEvent,
  },
  'new-round': {
    handler: genericUpdateEvent,
  },
  'game-already-started': {
    handler: joinRefusedEvent,
  },
  'room-full': {
    handler: joinRefusedEvent,
  },
  'removed-from-room': {
    handler: joinRefusedEvent,
  },
  update: {
    handler: playerUpdateEvent,
    snapshotScope: 'seat-slice',
  },
  // Whole-table change with no mode event of its own — full replace, like
  // the engines' '*-updated' family below.
  'table-updated': {
    handler: genericUpdateEvent,
  },
  'configuration-updated': {
    handler: genericUpdateEvent,
  },
  'group-challenge-scored': {
    handler: groupChallengeScoredEvent,
    snapshotScope: 'seat-slice',
  },
  // Whole-table state (turn cursor, eliminations, final scoring) — full replace
  'chain-updated': {
    handler: genericUpdateEvent,
  },
  'heritage-updated': {
    handler: genericUpdateEvent,
  },
  'timeline-updated': {
    handler: genericUpdateEvent,
  },
  'manhunt-updated': {
    handler: genericUpdateEvent,
  },
  'government-updated': {
    handler: genericUpdateEvent,
  },
  'unique-updated': {
    handler: genericUpdateEvent,
  },
  'sweep-updated': {
    handler: genericUpdateEvent,
  },
  // Despot's eyes only — arrives on their socket alone, no game payload
  'manhunt-position': {
    handler: manhuntPositionEvent,
  },
  // Ephemeral taunt relay — no game payload
  'manhunt-taunt': {
    handler: manhuntTauntEvent,
  },
  // Seat + round slice: a gate verdict also writes the seat's
  // `playerTurns[].blocked` record, which the bare seat slice drops.
  'individual-challenge-checked': {
    handler: groupChallengeScoredEvent,
    snapshotScope: 'seat-slice',
  },
  'index-update': {
    handler: indexUpdateEvent,
  },
  // Seat + round slice, the gate verdict's posture: a gauntlet KNOCKOUT also
  // stamps `playerTurns[].blocked` (the descent's license) — a bare seat
  // slice dropped it and the pawn never played its fall off the mountain.
  'final-challenge-checked': {
    handler: groupChallengeScoredEvent,
    snapshotScope: 'seat-slice',
  },
  'player-guessing': {
    handler: playerGuessingEvent,
  },
  'player-cheering': {
    handler: playerCheeringEvent,
  },
  // Ephemeral table announcement — no game payload
  'table-notice': {
    handler: tableNoticeEvent,
  },
  // The returning player's catch-up numbers — no game payload
  'autopilot-summary': {
    handler: autopilotSummaryEvent,
  },
}
