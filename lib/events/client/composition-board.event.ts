import type { ClientSideEventHandler } from '~~/lib/events/client-registry'
import { compositionBoardKey } from '~~/lib/composition'

/** Composition: this seat's own board, delivered to this socket alone (no
 *  `game` payload — the answer key and rivals' drops never ride a snapshot). */
export const compositionBoardEvent: ClientSideEventHandler = async ({ gameStore, payload }) => {
  if (payload.event !== 'composition-board' || !gameStore.game) return
  const { event: _event, ...board } = payload
  gameStore.compositionBoards = {
    ...gameStore.compositionBoards,
    [compositionBoardKey(gameStore.game.id, board.round)]: board,
  }
}
