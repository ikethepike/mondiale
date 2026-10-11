import { onBeforeUnmount, onMounted, ref } from 'vue'
import { prefersReducedMotion } from './motion'

/**
 * A reveal that opens on the player's own answer and then settles into the
 * truth: `settled` flips after `delayMs`, at once under reduced motion or when
 * nothing needs to move. `replay` starts it over (a scorecard flipping seats).
 */
export const useRevealSettle = (needsSettle: () => boolean, delayMs: () => number) => {
  const settled = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  const replay = () => {
    clearTimeout(timer)
    settled.value = prefersReducedMotion() || !needsSettle()
    if (settled.value) return
    timer = setTimeout(() => (settled.value = true), delayMs())
  }

  onMounted(replay)
  onBeforeUnmount(() => clearTimeout(timer))

  return { settled, replay }
}
