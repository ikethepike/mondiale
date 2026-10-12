import type { ClientSideEventHandler } from '~~/lib/events/client-registry'

/**
 * Manhunt: the despot's own trail and plan, delivered over a single-socket
 * emit (no `game` payload — the trail never rides a snapshot). Only the
 * despot's socket ever receives this.
 */
export const manhuntPositionEvent: ClientSideEventHandler = async ({ gameStore, payload }) => {
  if (payload.event !== 'manhunt-position') return
  const { event: _event, ...position } = payload
  gameStore.manhunt = position
}
