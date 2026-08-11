/**
 * The one SortableJS config for drag-to-reorder lists (the ranking round's
 * hand, chronicle's event cards). No touch delay on purpose: the hand always
 * fits on screen, so the consumer refuses the browser's pan gestures over the
 * list (`touch-action: none`) and a drag starts the instant a finger lands.
 * `forceFallback` keeps the drag ghost ours on every browser.
 *
 * A list that shares the screen with a scroller takes HOLD_DRAG_LIST_OPTIONS
 * instead — refusing pans there costs the player the rest of the view.
 */
export const DRAG_LIST_OPTIONS = {
  draggable: '.draggable',
  animation: 150,
  ghostClass: 'ghost',
  dragClass: 'drag',
  forceFallback: true,
  bubbleScroll: true,
} as const

/** How long a finger holds still before a card comes up. Under this the
 *  gesture belongs to the scroller the list stands in. */
export const DRAG_HOLD_MS = 220
/** Travel during the hold that hands the gesture back to the scroller. */
export const DRAG_HOLD_SLOP_PX = 6

/**
 * The same list where the column ALSO scrolls (chronicle's cards outgrow a
 * phone): the browser keeps vertical pan, so a swipe scrolls and a hold picks
 * a card up. `delayOnTouchOnly` leaves pointer drags immediate — a mouse never
 * competes with a pan.
 */
export const HOLD_DRAG_LIST_OPTIONS = {
  ...DRAG_LIST_OPTIONS,
  delay: DRAG_HOLD_MS,
  delayOnTouchOnly: true,
  touchStartThreshold: DRAG_HOLD_SLOP_PX,
} as const
