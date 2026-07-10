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
