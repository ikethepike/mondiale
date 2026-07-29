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
 * The software keyboard's overlap with the layout viewport, published as
 * `--keyboard-inset` (px) on :root. Android resizes the layout for its
 * keyboard (the `interactive-widget=resizes-content` meta), so bottom
 * chrome rides up on its own and the overlap here stays 0. iOS resizes
 * nothing — dvh ignores the keyboard — so a bottom-anchored console lands
 * underneath it and Safari scrolls the whole fixed shell out of frame to
 * chase the caret. Bottom chrome adds the token to its offset to sit on the
 * keyboard's top edge instead; with the caret visible, the clamp below can
 * hold the shell at rest. Mounted once in the layout.
 */
export const useKeyboardInset = () => {
  const inset = ref(0)

  const sync = () => {
    const viewport = window.visualViewport
    if (!viewport) return
    const overlap = Math.max(
      0,
      Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
    )
    if (overlap !== inset.value) {
      inset.value = overlap
      document.documentElement.style.setProperty('--keyboard-inset', `${overlap}px`)
    }
    // The game shell never scrolls by design (see main.scss) — while the
    // keyboard is up, any scroll offset on a non-scrollable document is the
    // browser's caret-chasing pan. Undo it; the lifted chrome keeps the
    // caret visible, so the browser doesn't pan again. Genuinely scrollable
    // pages are left alone.
    const panned = window.scrollY || viewport.offsetTop
    if (overlap > 0 && panned && document.documentElement.scrollHeight <= window.innerHeight) {
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
