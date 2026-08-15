import { nextTick, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { prefersReducedMotion } from './motion'

/**
 * A landing trail of country chips that always shows its newest name.
 *
 * On phones a trail is one horizontal rail (`.country-chip-list.rail` in
 * templates/_country-chip.scss): a wrapping list standing in a footer the
 * keyboard has squeezed gives up its height mid-row and serves half a chip,
 * and the name that just landed is the half that goes. A rail only earns that
 * if it follows the head, so the one scroll-to-the-newest lives here instead
 * of in each view's own watcher — both axes, since the same trail wraps and
 * scrolls vertically on a desktop-sized board.
 *
 * It rests on a chip BOUNDARY, never at raw maximum scroll: parking at the end
 * left whatever chip straddled the leading edge sliced mid-name ("…mbique"),
 * which is the same broken read as the clipped row, turned on its side. The
 * slack that buys goes after the newest chip, where empty space says "this is
 * the head" instead of "a name got cut".
 */
export const useChipTrail = (count: MaybeRefOrGetter<number>) => {
  const trail = ref<HTMLElement | { $el?: HTMLElement } | null>(null)

  /**
   * Where a rail comes to rest: the start of the earliest chip that still
   * leaves the newest one whole (the newest chip's own start when that chip is
   * wider than the rail — a name too long to frame reads from its beginning).
   *
   * Chip widths don't tile, so that resting point usually lies PAST the end of
   * the content, and the rail grows exactly the trailing slack it needs to
   * reach it. Without the slack the scroller stops at its raw maximum with the
   * newest chip flush right, which is precisely where a name gets sliced by the
   * leading edge. Re-measured from zero on every landing, so the rail never
   * accumulates room it has stopped needing.
   */
  const railRestingPoint = (element: HTMLElement): number => {
    element.style.paddingInlineEnd = '0px'
    const chips = [...element.children].filter(
      (child): child is HTMLElement => 'offsetLeft' in child
    )
    const [first] = chips
    const newest = chips.at(-1)
    const overflow = element.scrollWidth - element.clientWidth
    if (!first || !newest || overflow <= 0) return 0
    // Layout offsets, never `getBoundingClientRect`: the chip that just landed
    // is still riding its `chain` enter transform, and a rect would measure it
    // where the animation currently holds it rather than where it will rest.
    const startOf = (chip: HTMLElement) => chip.offsetLeft - first.offsetLeft
    const flush = startOf(newest) + newest.offsetWidth - element.clientWidth
    const target = startOf(chips.find(chip => startOf(chip) >= flush) ?? newest)
    element.style.paddingInlineEnd = `${Math.max(0, target - overflow)}px`
    return target
  }

  watch(
    () => toValue(count),
    async () => {
      await nextTick()
      const held = trail.value
      const element = held instanceof HTMLElement ? held : held?.$el
      if (!element) return
      element.scrollTo({
        top: element.scrollHeight,
        left: railRestingPoint(element),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      })
    }
  )

  return { trail }
}
