import type { ClientSideEventHandler } from '~~/plugins/socket.client'

/**
 * Manhunt: the despot's own trail, delivered over a single-socket emit (no
 * `game` payload — the trail never rides a snapshot). Only the despot's
 * socket ever receives this.
 */
export const manhuntPositionEvent: ClientSideEventHandler = async ({ gameStore, payload }) => {
  if (payload.event !== 'manhunt-position') return
  gameStore.manhunt = { trail: payload.trail, turn: payload.turn }
}
