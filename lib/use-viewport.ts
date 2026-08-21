import { onBeforeUnmount, onMounted, ref } from 'vue'
import { clamp } from './number'

/** Reactive matchMedia flag; SSR-safe (false until mounted). */
const useMediaMatch = (query: string) => {
  const matches = ref(false)
  let media: MediaQueryList | undefined
  const sync = () => (matches.value = !!media?.matches)
  onMounted(() => {
    media = window.matchMedia(query)
    sync()
    media.addEventListener('change', sync)
  })
  onBeforeUnmount(() => media?.removeEventListener('change', sync))
  return matches
}

// Keep in sync with $tablet in assets/scss/rules/_breakpoints.scss.
export const PHONE_MAX_PX = 640

/** Phone-width viewport — the same boundary the SCSS mobile blocks use. */
export const useIsPhone = () => useMediaMatch(`(max-width: ${PHONE_MAX_PX}px)`)

// Keep in sync with $short in assets/scss/rules/_breakpoints.scss.
export const SHORT_MAX_PX = 480

/** Too short to give a stage its natural height — a phone on its side, a
 *  window dragged down to a strip. Independent of width: landscape is wide. */
export const useIsShortViewport = () => useMediaMatch(`(max-height: ${SHORT_MAX_PX}px)`)

/** Coarse-pointer (touch-first) device, independent of viewport size. */
export const useIsCoarsePointer = () => useMediaMatch('(pointer: coarse)')

/**
 * Nearest-edge scrollTop that keeps an item inside its own list — never
 * touches ancestors. The suggestion lists use this instead of scrollIntoView,
 * whose ancestor walk can scroll the DOCUMENT and fight the pan clamp below.
 */
export const listScrollTop = (
  scrollTop: number,
  viewHeight: number,
  itemTop: number,
  itemHeight: number
): number => {
  if (itemTop < scrollTop) return itemTop
  const itemBottom = itemTop + itemHeight
  // Taller-than-view items pin to their top edge, like scrollIntoView 'nearest'
  if (itemBottom > scrollTop + viewHeight) return Math.min(itemTop, itemBottom - viewHeight)
  return scrollTop
}

/**
 * Scroll offset that CENTRES an item in its own scroller. Unlike
 * `listScrollTop` it moves even when the item is already visible: the callers
 * are reveals answering "where did mine land?", not keep-in-view nudges.
 * Clamped to the scrollable range, so an item near either end pins there.
 */
export const centreScrollTop = (
  viewLength: number,
  scrollLength: number,
  itemStart: number,
  itemLength: number
): number =>
  clamp(itemStart - (viewLength - itemLength) / 2, 0, Math.max(0, scrollLength - viewLength))

/**
 * The keyboard's occlusion of the layout viewport. Pure so the platform
 * shapes are unit-testable: iOS Safari keeps the layout viewport at full
 * height under the keyboard; Android (`interactive-widget=resizes-content`)
 * resizes it to match the visual viewport, so the overlap reads 0; a
 * pinch-zoomed viewport is not a keyboard (`height * scale` spans the full
 * layout width again).
 */
export const keyboardOverlap = (layoutHeight: number, viewportHeight: number, scale = 1): number =>
  Math.max(0, Math.round(layoutHeight - viewportHeight * scale))

// Settle contract: geometry identical for STABLE_FRAMES consecutive frames,
// hard cap SETTLE_MAX_MS — the loop must outlive the keyboard slide and any
// delayed caret pan, because visualViewport goes silent after its last event
// (the exact hole that once left the shell stuck panned off-screen).
const STABLE_FRAMES = 10
const SETTLE_MAX_MS = 1500

/** Pan clamps this session — the KeyboardLab HUD's tell that the engine acted. */
export const keyboardClampCount = ref(0)

/** The live inset, shared: components react to the keyboard through THIS
 *  (never their own visualViewport listeners). The engine below writes it. */
export const keyboardInset = ref(0)

/**
 * The software keyboard's overlap with the layout viewport, published as
 * `--keyboard-inset` (px) on :root. Android resizes the layout for its
 * keyboard, so the overlap stays 0 and bottom chrome rides up on its own.
 * iOS resizes nothing — dvh ignores the keyboard — so a bottom-anchored
 * console lands underneath it and Safari pans the whole fixed shell out of
 * frame to chase the caret. Bottom chrome adds the token to its offset to
 * sit on the keyboard's top edge instead (instantly — the shell contract
 * forbids easing the lift), and the clamp holds the shell at rest.
 * Mounted once in the layout.
 *
 * Everything measures against documentElement.clientHeight: innerHeight is
 * not keyboard-stable on iOS, and the caret pan must NOT be subtracted
 * (viewport.offsetTop ≈ keyboard height mid-pan, which would zero the lift
 * on exactly the frames that need it and deadlock the recovery).
 */
export const useKeyboardInset = () => {
  const inset = keyboardInset
  let frame = 0
  let stable = 0
  let deadline = 0
  let lastGeometry = ''

  const geometry = () => {
    const viewport = window.visualViewport
    return [
      document.documentElement.clientHeight,
      viewport?.height,
      viewport?.offsetTop,
      viewport?.scale,
      window.scrollY,
    ].join('|')
  }

  const sync = () => {
    const viewport = window.visualViewport
    if (!viewport) return
    const layoutHeight = document.documentElement.clientHeight
    const overlap = keyboardOverlap(layoutHeight, viewport.height, viewport.scale)
    if (overlap !== inset.value) {
      inset.value = overlap
      document.documentElement.style.setProperty('--keyboard-inset', `${overlap}px`)
      // The one CSS-side keyboard-state signal: suggest-berth collapse and
      // the upward dropdown flip key off this class, never their own probes
      document.documentElement.classList.toggle('keyboard-up', overlap > 0)
    }
    // Every typed input stands in an inset-consuming footer (the shell
    // contract), so with the keyboard up, any scroll offset on this
    // intrinsically non-scrollable document is a caret-chasing pan — always
    // wrong, always undone (iOS grants a temporary scroll allowance under
    // the keyboard). Genuinely scrollable pages are left alone.
    const panned = window.scrollY || viewport.offsetTop
    if (overlap > 0 && panned && document.documentElement.scrollHeight <= layoutHeight) {
      keyboardClampCount.value++
      window.scrollTo(0, 0)
    }
  }

  const step = () => {
    sync()
    const now = geometry()
    stable = now === lastGeometry ? stable + 1 : 0
    lastGeometry = now
    if (stable >= STABLE_FRAMES || performance.now() >= deadline) {
      frame = 0
      return
    }
    frame = requestAnimationFrame(step)
  }

  // Restarted by every event: sync now, then chase per frame until still.
  const settle = () => {
    stable = 0
    deadline = performance.now() + SETTLE_MAX_MS
    sync()
    if (!frame) frame = requestAnimationFrame(step)
  }

  onMounted(() => {
    window.visualViewport?.addEventListener('resize', settle)
    window.visualViewport?.addEventListener('scroll', settle)
    // visualViewport never reports focus moves — these wake the loop for
    // the keyboard transitions its events arrive too early (or never) for.
    window.addEventListener('focusin', settle)
    window.addEventListener('focusout', settle)
    settle()
  })
  onBeforeUnmount(() => {
    window.visualViewport?.removeEventListener('resize', settle)
    window.visualViewport?.removeEventListener('scroll', settle)
    window.removeEventListener('focusin', settle)
    window.removeEventListener('focusout', settle)
    if (frame) cancelAnimationFrame(frame)
    document.documentElement.style.removeProperty('--keyboard-inset')
    document.documentElement.classList.remove('keyboard-up')
  })

  return inset
}
