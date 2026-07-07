import { gsap } from 'gsap'
import { EASE, prefersReducedMotion } from './motion'

/**
 * Enter/leave choreography for the phase views in pages/room/[roomId].vue,
 * keyed by view *kind* — five recipes, not one per view.
 *
 * Timing budget: leave ≤ 0.25s, enter ≤ 0.5s. The server's smallest gaps are
 * 500ms per pawn step (which never remounts the board view), 2s before a new
 * round and 5s after a challenge answer, so a full out+in always fits.
 * Vue's <Transition mode="out-in" :css="false"> serializes via the done()
 * callbacks, so a phase change arriving mid-transition queues instead of
 * stacking.
 */
export type ViewKind = 'lobby' | 'card' | 'challenge' | 'score' | 'board' | 'victory'

type EnterRecipe = (el: Element, done: () => void) => void

const CLEAR = { clearProps: 'opacity,transform' } as const

const enterRecipes: Record<ViewKind, EnterRecipe> = {
  lobby(el, done) {
    gsap.fromTo(
      el,
      { opacity: 0, y: '6%' },
      { opacity: 1, y: 0, duration: 0.5, ease: EASE.enter, ...CLEAR, onComplete: done }
    )
  },
  card(el, done) {
    gsap.fromTo(
      el,
      { opacity: 0, y: '6%' },
      { opacity: 1, y: 0, duration: 0.5, ease: EASE.enter, ...CLEAR, onComplete: done }
    )
  },
  challenge(el, done) {
    const timeline = gsap.timeline({ onComplete: done })
    timeline.fromTo(
      el,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.45, ease: EASE.enter, ...CLEAR }
    )

    // Country cards (group challenge) rise in from below the viewport —
    // prepare() already parked them off-screen before first paint
    const cards = el.querySelectorAll('.country')
    if (cards.length) {
      timeline.to(
        cards,
        { y: 0, duration: 0.55, ease: EASE.enter, stagger: 0.06, ...CLEAR },
        '<0.05'
      )
    }
  },
  score(el, done) {
    gsap.fromTo(
      el,
      { opacity: 0, scale: 0.97 },
      { opacity: 1, scale: 1, duration: 0.4, ease: EASE.enter, ...CLEAR, onComplete: done }
    )
  },
  board(el, done) {
    gsap.fromTo(
      el,
      { opacity: 0 },
      { opacity: 1, duration: 0.35, ease: EASE.cross, ...CLEAR, onComplete: done }
    )
  },
  victory(el, done) {
    gsap.fromTo(
      el,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.5, ease: EASE.enter, ...CLEAR, onComplete: done }
    )
  },
}

export const usePhaseTransition = (kind: () => ViewKind) => {
  // Runs before the element's first paint. With :css="false", the inserted
  // view can otherwise flash fully-styled for a frame before @enter's tween
  // takes hold — this parks everything in its pre-animation state.
  const onBeforeEnter = (el: Element) => {
    if (prefersReducedMotion()) return

    gsap.set(el, { opacity: 0 })
    if (kind() === 'challenge') {
      const cards = el.querySelectorAll('.country')
      if (cards.length) gsap.set(cards, { y: '110vh' })
    }
  }

  const onEnter = (el: Element, done: () => void) => {
    if (prefersReducedMotion()) {
      gsap.set([el, ...el.querySelectorAll('.country')], { clearProps: 'all' })
      return done()
    }

    enterRecipes[kind()](el, done)
  }

  // Leaves are deliberately uniform: a quick fade keeps every hand-off calm
  // and sidesteps reading the *outgoing* view's kind after the switch.
  const onLeave = (el: Element, done: () => void) => {
    gsap.killTweensOf(el)
    if (prefersReducedMotion()) return done()

    gsap.to(el, { opacity: 0, duration: 0.22, ease: EASE.exit, onComplete: done })
  }

  const onEnterCancelled = (el: Element) => {
    gsap.killTweensOf(el)
    el.querySelectorAll('.country').forEach(card => gsap.killTweensOf(card))
  }

  return { onBeforeEnter, onEnter, onLeave, onEnterCancelled }
}
