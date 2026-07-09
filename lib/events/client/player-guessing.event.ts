import type { ClientSideEventHandler } from '~~/plugins/socket.client'

/** Bounds the list between prune ticks, so a burst can't grow the DOM. */
const MAX_ENTRIES = 24

/**
 * A live guess arrived from another player during a group round — append it to
 * the ticker so the active View can show opponents' picks landing in real time.
 * Ephemeral: never touches permanent game state.
 */
export const playerGuessingEvent: ClientSideEventHandler = ({ payload, gameStore, playerId }) => {
  if (payload.event !== 'player-guessing') return
  // The room broadcast echoes to the sender; own chips come from local state.
  if (payload.playerId === playerId) return

  const next = [
    ...gameStore.map.liveGuesses,
    {
      entryId: payload.entryId,
      playerId: payload.playerId,
      kind: payload.kind,
      isoCode: payload.isoCode,
      label: payload.label,
      at: payload.at,
    },
  ]
  gameStore.map.liveGuesses = next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
}
