import type { ClientSideEventHandler } from '~~/plugins/socket.client'

/**
 * A live guess arrived from another player during a group round — stash it in
 * the store keyed by playerId so the active View can show opponents' picks
 * landing in real time. Ephemeral: never touches permanent game state.
 */
export const playerGuessingEvent: ClientSideEventHandler = ({ payload, gameStore, playerId }) => {
  if (payload.event !== 'player-guessing') return
  // Our own guesses are shown from local state; only track opponents.
  if (payload.playerId === playerId) return
  gameStore.map.liveGuesses = { ...gameStore.map.liveGuesses, [payload.playerId]: payload.isoCode }
}
