import type { ClientSideEventHandler } from '~~/plugins/socket.client'

/**
 * The join was refused: the game was underway before this player arrived, or
 * the table was already at MAX_PLAYERS. The payload carries no game — writing
 * one to the store would leave `game` set while `game.players[playerId]` stays
 * empty, which reads downstream as "still joining" and strands the page on the
 * loading screen. The server closes the socket right after, so this is
 * terminal; the reason only picks the dead-end card's copy.
 */
export const joinRefusedEvent: ClientSideEventHandler = ({ payload, gameStore }) => {
  if (payload.event !== 'game-already-started' && payload.event !== 'room-full') return
  gameStore.rejected = payload.event === 'room-full' ? 'full' : 'started'
}
