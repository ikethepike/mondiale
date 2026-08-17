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
  let mutations: MutationObserver | undefined

  // The port's own box is NOT enough to know when the flags went stale. A
  // scrollport is sized by its parent — a flex item, a dvh cap — so content
  // landing inside it never resizes it, and content arriving fires no scroll
  // event either. Both of the ways a list grows are silent to an observer
  // watching the port alone: the stat detective deals a clue every few seconds,
  // and a card photo finishing its load makes a row taller a beat after mount.
  // Measured before this: appending into a fitting list took it 347px past its
  // bottom edge with `.fade-bottom` still unset.
  //
  // So two signals, because neither covers the other. The children are observed
  // for anything that grows a box — a photo landing in a row — and insertions
  // are watched across the whole subtree, because a box is exactly what an
  // arriving row does NOT change: a wrapper clamped by the port keeps its 323px
  // while the rows inside it push `scrollHeight` to 682, so a resize observer at
  // any depth sees nothing at all. The insertion itself is the only event.
  const attach = (el: HTMLElement) => {
    observer?.disconnect()
    observer ??= new ResizeObserver(syncScrollEdges)
    observer.observe(el, { box: 'border-box' })
    for (const child of el.children) observer.observe(child)
    syncScrollEdges()
  }

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
        mutations?.disconnect()
        if (el) {
          attach(el)
          mutations ??= new MutationObserver(() => attach(el))
          mutations.observe(el, { childList: true, subtree: true })
        } else {
          observer?.disconnect()
          syncScrollEdges()
        }
      },
      { immediate: true, flush: 'post' }
    )
  }

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = undefined
    mutations?.disconnect()
    mutations = undefined
  })

  return { scrollableUp, scrollableDown, scrollableLeft, scrollableRight, syncScrollEdges }
}
