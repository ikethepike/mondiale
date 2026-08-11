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

/**
 * Dragging a thing ONTO a target, rather than reordering a list in place —
 * Parliament's benches dropping onto the arc.
 *
 * Both ends share ONE group name and both `pull` and `put`: the tray gives a
 * bench away and takes it back on a miss, so a one-way `pull: 'clone'` /
 * `put: false` pair silently refuses every drop. `sort: false` because neither
 * side has an order worth rearranging — the arc's order is the chamber's.
 *
 * Shared here rather than inlined so a second drop-target mode inherits the
 * same feel instead of inventing its own.
 */
const DROP_GROUP = 'bench-drop'

export const DRAG_SOURCE_OPTIONS = {
  ...DRAG_LIST_OPTIONS,
  group: { name: DROP_GROUP, pull: true, put: true },
  sort: false,
} as const

export const DROP_TARGET_OPTIONS = {
  ...DRAG_LIST_OPTIONS,
  group: { name: DROP_GROUP, pull: true, put: true },
  sort: false,
} as const
