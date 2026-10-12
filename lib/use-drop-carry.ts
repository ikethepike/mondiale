import { ref } from 'vue'

/**
 * A fallback drag ends in a real click on whatever it was dropped on:
 * SortableJS only swallows that click when the drag never reached a target,
 * which is the opposite of the case that needs swallowing — untouched, the
 * drop's own click would pick the dropped thing straight back up again.
 */
export const DRAG_CLICK_GRACE_MS = 400

export interface DropCarryEvent {
  item?: HTMLElement
  from?: HTMLElement
  oldIndex?: number
}

/**
 * SortableJS as an input device for drop-target modes (the shared configs in
 * lib/drag-list.ts): every list is rendered from state, so the DOM Sortable
 * produces is always put back and the state change re-renders both ends.
 */
export const useDropCarry = () => {
  /**
   * When the drag lifecycle last spoke. A stamp rather than an in-flight flag:
   * a drop RE-KEYS the list it came from, so the `end` that would clear a flag
   * is emitted by a component Vue has already thrown away.
   */
  let dragAt = 0
  const stampDrag = () => (dragAt = performance.now())
  const tapAllowed = () => performance.now() - dragAt > DRAG_CLICK_GRACE_MS

  /** Bumped on every accepted drop so the Sortables re-key and rebuild. */
  const revision = ref(0)

  /** Sortable MOVES the dragged node into the receiving list; left there it
   *  would survive beside the one Vue renders, and the thing would multiply. */
  const undoDomMove = ({ item, from, oldIndex }: DropCarryEvent) => {
    if (!item || !from) return
    const sibling = from.children[oldIndex ?? from.children.length] ?? null
    from.insertBefore(item, sibling)
  }

  return { stampDrag, tapAllowed, revision, undoDomMove }
}
