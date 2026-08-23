import { gsap } from 'gsap'
import { onMounted, onUnmounted, type Ref } from 'vue'
import { EASE, prefersReducedMotion } from '~~/lib/motion'

/**
 * The full-screen intro beat every announcement overlay shares (Interstitial,
 * GauntletIntro): fade in, stagger the copy up, draw the rule, hold, fade out
 * — tap to skip, exactly one `done`. Skins flourish through `decorate`.
 */
export const useIntroBeat = (
  root: Ref<HTMLElement | undefined>,
  options: {
    /** Selector for the staggered copy pieces (e.g. '[data-intro]'). */
    pieceSelector: string
    /** Seconds to hold before the fade-out. */
    holdFor: () => number
    /** Timeline position for the pieces stagger — later when a flourish leads. */
    piecesAt?: string
    /** Extra timeline steps right after the shell fade-in. */
    decorate?: (timeline: gsap.core.Timeline, root: HTMLElement) => void
    /** Reduced motion: static dressing + how long to hold (ms). */
    reducedMotionHoldMs?: number
    onReducedMotion?: (root: HTMLElement) => void
  },
  onDone: () => void
) => {
  let timeline: gsap.core.Timeline | undefined
  let finished = false

  const finish = () => {
    if (finished) return
    finished = true
    onDone()
  }

  const skip = () => {
    timeline?.progress(1)
    finish()
  }

  onMounted(() => {
    if (!root.value) return finish()

    if (prefersReducedMotion()) {
      options.onReducedMotion?.(root.value)
      setTimeout(finish, options.reducedMotionHoldMs ?? 1200)
      return
    }

    const pieces = root.value.querySelectorAll(options.pieceSelector)
    timeline = gsap.timeline({ onComplete: finish })
    timeline.fromTo(root.value, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: EASE.cross })
    options.decorate?.(timeline, root.value)
    // The walk lead is sized from this timeline
    // (MOVE_INTERSTITIAL_OVERHEAD_MS in round-beats): every frame added here
    // is a frame the pawn stands still.
    timeline.fromTo(
      pieces,
      { opacity: 0, y: 22, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.38, ease: EASE.enter, stagger: 0.07 },
      options.piecesAt ?? '<0.1'
    )
    timeline.fromTo(
      root.value.querySelector('hr'),
      { scaleX: 0 },
      { scaleX: 1, duration: 0.34, ease: EASE.cross },
      '<0.2'
    )
    timeline.to(root.value, {
      opacity: 0,
      duration: 0.28,
      ease: EASE.exit,
      delay: options.holdFor(),
    })
  })

  onUnmounted(() => {
    timeline?.kill()
    if (root.value) gsap.killTweensOf(root.value)
  })

  return { skip, finish }
}
