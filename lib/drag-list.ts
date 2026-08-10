/**
 * The one SortableJS config for drag-to-reorder lists (the ranking round's
 * hand, chronicle's event cards). No touch delay on purpose: consumers refuse
 * the browser's pan gestures over the list, so a drag can start the instant a
 * finger lands. `forceFallback` keeps the drag ghost ours on every browser.
 */
export const DRAG_LIST_OPTIONS = {
  draggable: '.draggable',
  animation: 150,
  ghostClass: 'ghost',
  dragClass: 'drag',
  forceFallback: true,
  bubbleScroll: true,
} as const
