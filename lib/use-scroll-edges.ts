import { onBeforeUnmount, ref, watch } from 'vue'

/**
 * Scroll-edge state for a scrollport: does its content continue past each of
 * its four edges. Drives the `.fade-top`/`.fade-bottom` classes the scroll-edge
 * fades key off (templates/_sheet.scss for parked sheets, the answer ledger's
 * own block for the scorecard) and the `.fade-left`/`.fade-right` pair for the
 * sideways ones (the ledger rails across a wide board) — a fade shows only when
 * there is actually more to see, so a short list never wears a dimmed last row.
 *
 * Both axes always: a scrollport that turns with the viewport (the timeline
 * ledger is a column on a phone and a rail on a board) would otherwise need two
 * instances to describe one element, and the flags for an axis that cannot
 * scroll simply stay false.
 *
 * `observe` lets a host that already runs its own ResizeObserver keep one
 * observer: useBottomSheet re-judges the edges in the same callback that
 * verifies its parked transform, so it opts out and calls `syncScrollEdges`
 * itself. Simple hosts leave it on and only bind `@scroll.passive`.
 */
export const useScrollEdges = (
  body: () => HTMLElement | undefined,
  { observe = true }: { observe?: boolean } = {}
) => {
  const scrollableUp = ref(false)
  const scrollableDown = ref(false)
  const scrollableLeft = ref(false)
  const scrollableRight = ref(false)

  // The 1px slack absorbs sub-pixel scroll offsets — without it a list resting
  // exactly at its end flickers its bottom fade on fractional device scales.
  const syncScrollEdges = () => {
    const el = body()
    if (!el) return
    scrollableUp.value = el.scrollTop > 1
    scrollableDown.value = el.scrollTop + el.clientHeight < el.scrollHeight - 1
    // `Math.abs` because a right-to-left scrollport counts scrollLeft downward
    // from zero, so the raw value is negative at the start edge.
    scrollableLeft.value = Math.abs(el.scrollLeft) > 1
    scrollableRight.value = Math.abs(el.scrollLeft) + el.clientWidth < el.scrollWidth - 1
  }

  let observer: ResizeObserver | undefined

  // The scrollport is not always there when the host mounts: a list behind a
  // `v-if` — a round beat that has not been dealt yet, a panel that swaps in
  // mid-round — appears later, and an observer attached once on mount would
  // never see it (and the edges would read as "nothing to scroll" forever).
  // Watching the getter re-attaches on every change, undefined → element
  // included. `flush: 'post'` so the element is laid out before it is measured.
  if (observe) {
    watch(
      body,
      el => {
        observer?.disconnect()
        if (el) {
          observer ??= new ResizeObserver(syncScrollEdges)
          observer.observe(el, { box: 'border-box' })
        }
        syncScrollEdges()
      },
      { immediate: true, flush: 'post' }
    )
  }

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = undefined
  })

  return { scrollableUp, scrollableDown, scrollableLeft, scrollableRight, syncScrollEdges }
}
