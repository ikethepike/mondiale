import type { ClientSideEventHandler } from '~~/lib/events/client-registry'

/**
 * The join was refused: the game was underway before this player arrived, the
 * table was already at MAX_PLAYERS, or the host removed them. The payload
 * carries no game — writing one to the store would leave `game` set while
 * `game.players[playerId]` stays empty, which reads downstream as "still
 * joining" and strands the page on the loading screen. The server closes the
 * socket right after — except for a spectatable room-full, which stays
 * connected so "Watch instead" can re-emit join without a reconnect dance.
 */
export const joinRefusedEvent: ClientSideEventHandler = ({ payload, gameStore }) => {
  if (payload.event === 'room-full') {
    gameStore.rejected = 'full'
    gameStore.spectatable = payload.spectatable === true
    return
  }
  if (payload.event === 'game-already-started') gameStore.rejected = 'started'
  if (payload.event === 'removed-from-room') gameStore.rejected = 'removed'
}
