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
 */
export const useChipTrail = (count: MaybeRefOrGetter<number>) => {
  const trail = ref<HTMLElement | { $el?: HTMLElement } | null>(null)

  watch(
    () => toValue(count),
    async () => {
      await nextTick()
      const held = trail.value
      const element = held instanceof HTMLElement ? held : held?.$el
      if (!element) return
      element.scrollTo({
        top: element.scrollHeight,
        left: element.scrollWidth,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      })
    }
  )

  return { trail }
}
