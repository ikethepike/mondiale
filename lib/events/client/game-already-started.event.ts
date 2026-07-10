import type { ClientSideEventHandler } from '~~/plugins/socket.client'

/**
 * The join was refused: the game was underway before this player arrived. The
 * payload carries the game purely as context — writing it to the store would
 * leave `game` set while `game.players[playerId]` stays empty, which reads
 * downstream as "still joining" and strands the page on the loading screen.
 * The server closes the socket right after, so this is terminal.
 */
export const gameAlreadyStartedEvent: ClientSideEventHandler = ({ payload, gameStore }) => {
  if (payload.event !== 'game-already-started') return
  gameStore.rejected = true
}
