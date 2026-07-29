import { onBeforeUnmount, onMounted, ref } from 'vue'

/** Reactive matchMedia flag; SSR-safe (false until mounted). */
export const useMediaMatch = (query: string) => {
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

/** Coarse-pointer (touch-first) device, independent of viewport size. */
export const useIsCoarsePointer = () => useMediaMatch('(pointer: coarse)')

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

/**
 * The software keyboard's overlap with the layout viewport, published as
 * `--keyboard-inset` (px) on :root. Android resizes the layout for its
 * keyboard, so the overlap stays 0 and bottom chrome rides up on its own.
 * iOS resizes nothing — dvh ignores the keyboard — so a bottom-anchored
 * console lands underneath it and Safari pans the whole fixed shell out of
 * frame to chase the caret. Bottom chrome adds the token to its offset to
 * sit on the keyboard's top edge instead; with the caret visible, the clamp
 * below can hold the shell at rest. Mounted once in the layout.
 *
 * Everything measures against documentElement.clientHeight: innerHeight is
 * not keyboard-stable on iOS, and the caret pan must NOT be subtracted
 * (viewport.offsetTop ≈ keyboard height mid-pan, which would zero the lift
 * on exactly the frames that need it and deadlock the recovery).
 */
export const useKeyboardInset = () => {
  const inset = ref(0)

  const sync = () => {
    const viewport = window.visualViewport
    if (!viewport) return
    const layoutHeight = document.documentElement.clientHeight
    const overlap = keyboardOverlap(layoutHeight, viewport.height, viewport.scale)
    if (overlap !== inset.value) {
      inset.value = overlap
      document.documentElement.style.setProperty('--keyboard-inset', `${overlap}px`)
    }
    // The game shell never scrolls by design (see main.scss) — while the
    // keyboard is up, any scroll offset on an intrinsically non-scrollable
    // document is the browser's caret-chasing pan (iOS grants a temporary
    // scroll allowance under the keyboard). Undo it; the lifted chrome keeps
    // the caret visible, so the browser doesn't pan again. Genuinely
    // scrollable pages are left alone.
    const panned = window.scrollY || viewport.offsetTop
    if (overlap > 0 && panned && document.documentElement.scrollHeight <= layoutHeight) {
      window.scrollTo(0, 0)
    }
  }

  onMounted(() => {
    window.visualViewport?.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('scroll', sync)
    sync()
  })
  onBeforeUnmount(() => {
    window.visualViewport?.removeEventListener('resize', sync)
    window.visualViewport?.removeEventListener('scroll', sync)
    document.documentElement.style.removeProperty('--keyboard-inset')
  })

  return inset
}
