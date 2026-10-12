import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { compositionBoardKey } from '~~/lib/composition'
import { useClientEvents } from '~~/lib/events/client-side'
import type { CompositionPlacement } from '~~/types/challenges/group-modes.type'
import type { SeatEcho } from '~~/types/events.types'

/**
 * This seat's Composition board as the server holds it: each drop is sent
 * for grading and answered by the targeted 'composition-board' emit, and a
 * fetch restores the board after a reload or brings the reveal once graded.
 */
export const useCompositionBoard = (round: MaybeRefOrGetter<number | undefined>) => {
  const { gameStore, update } = useClientEvents()
  const board = computed(() => {
    const index = toValue(round)
    return gameStore.game && index !== undefined
      ? gameStore.compositionBoards[compositionBoardKey(gameStore.game.id, index)]
      : undefined
  })

  const fetchBoard = () => {
    const index = toValue(round)
    if (index === undefined) return Promise.resolve(false)
    return update({ event: 'fetch-composition-board', round: index }).catch(() => false)
  }

  const sendDrop = (placement: CompositionPlacement, echo: SeatEcho) =>
    update({
      event: 'submit-composition-drop',
      ...placement,
      attempt: board.value?.attempts ?? 0,
      ...echo,
    }).catch(() => false)

  return { board, fetchBoard, sendDrop }
}
