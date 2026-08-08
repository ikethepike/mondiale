import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Scroll-edge state for a scrollport: does its content continue above, below,
 * or both. Drives the `.fade-top`/`.fade-bottom` classes the scroll-edge
 * fades key off (templates/_sheet.scss for parked sheets, the answer ledger's
 * own block for the scorecard) — a fade shows only when there is actually
 * more to see, so a short list never wears a dimmed last row.
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

  // The 1px slack absorbs sub-pixel scroll offsets — without it a list resting
  // exactly at its end flickers its bottom fade on fractional device scales.
  const syncScrollEdges = () => {
    const el = body()
    if (!el) return
    scrollableUp.value = el.scrollTop > 1
    scrollableDown.value = el.scrollTop + el.clientHeight < el.scrollHeight - 1
  }

  let observer: ResizeObserver | undefined

  onMounted(() => {
    syncScrollEdges()
    if (!observe) return
    observer = new ResizeObserver(syncScrollEdges)
    const el = body()
    if (el) observer.observe(el, { box: 'border-box' })
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = undefined
  })

  return { scrollableUp, scrollableDown, syncScrollEdges }
}
