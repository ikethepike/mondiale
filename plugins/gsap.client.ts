import { gsap } from 'gsap'
import { EASE, MOTION, prefersReducedMotion } from '~~/lib/motion'

// Registers global GSAP defaults. Components import `gsap` directly —
// this plugin only aligns defaults with the motion tokens and applies the
// reduced-motion guard. Individual helpers still check prefersReducedMotion()
// so end-states are applied instantly rather than merely sped up.
export default defineNuxtPlugin(() => {
  gsap.defaults({
    ease: EASE.enter,
    duration: MOTION.base,
  })

  if (prefersReducedMotion()) {
    gsap.globalTimeline.timeScale(50)
  }
})
