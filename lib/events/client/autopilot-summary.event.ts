import type { ClientSideEventHandler } from '~~/lib/events/client-registry'

/**
 * The catch-up numbers for a seat the autopilot just released. Broadcast to
 * the room, rendered only by the returning player — everyone else gets the
 * ticker line via `table-notice`.
 */
export const autopilotSummaryEvent: ClientSideEventHandler = ({ payload, gameStore, playerId }) => {
  if (payload.event !== 'autopilot-summary') return
  if (payload.playerId !== playerId) return
  gameStore.reclaim = { rounds: payload.rounds, scored: payload.scored }
}
