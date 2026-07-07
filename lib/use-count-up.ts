import { gsap } from 'gsap'
import { MOTION, prefersReducedMotion } from './motion'

/**
 * Animated integer count-up for score displays. Tracks its target reactively,
 * so server-pushed score updates re-animate from the current displayed value.
 */
export const useCountUp = (
  target: MaybeRefOrGetter<number>,
  options: { duration?: number; delay?: number } = {}
) => {
  const display = ref(0)
  const proxy = { value: 0 }
  let tween: gsap.core.Tween | undefined

  const playTo = (value: number) => {
    tween?.kill()

    if (prefersReducedMotion()) {
      proxy.value = value
      display.value = value
      return
    }

    tween = gsap.to(proxy, {
      value,
      snap: { value: 1 },
      duration: options.duration ?? MOTION.slow * 1.5,
      delay: options.delay ?? 0,
      ease: 'power1.out',
      onUpdate() {
        display.value = Math.round(proxy.value)
      },
    })
  }

  onMounted(() => {
    watch(() => toValue(target), playTo, { immediate: true })
  })

  onUnmounted(() => tween?.kill())

  return { display }
}
