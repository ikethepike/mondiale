import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { BERTH_GAP_PX, claimMapBerth } from '~~/lib/map-berth'

/**
 * How tall the console band at the bottom of the shell is right now, in px —
 * published as `--footer-band` on :root, beside `--keyboard-inset`. The footer
 * stands against the shell's bottom edge and its padding already carries the
 * keyboard inset, so `--viewport-height - --footer-band` is exactly the clear
 * band above the console: what a layer that must not grow through it (the
 * gate column's cap) measures against. Keyed like the map claims, so a view
 * unmounting behind its successor can't wipe the live value.
 */
const bands = new Map<string, number>()

const publishBand = () => {
  const tallest = Math.max(0, ...bands.values())
  const root = document.documentElement
  if (tallest) root.style.setProperty('--footer-band', `${tallest}px`)
  else root.style.removeProperty('--footer-band')
}

/**
 * The map-side half of the standard bottom placement: a challenge whose
 * subject must stay visible hands its footer to this composable, and the
 * camera frames the subject in the clear band above it (gameStore.map.berth).
 * A ResizeObserver keeps the reservation honest — the software-keyboard lift
 * grows the footer's padding, so the camera glides up as the keyboard rises
 * instead of letting the console park over the framed country. Cleared on
 * unmount; clearBoard covers round changes.
 *
 * The reservation goes through the shared claim registry (lib/map-berth.ts),
 * so a second owner — the reveal card — can hold the band at the same time
 * without either wiping the other.
 *
 * The same measurement is published as `--footer-band` for the layout side.
 */
export const useFooterBerth = (footer: Ref<HTMLElement | undefined>, key = 'footer') => {
  const { gameStore } = useClientEvents()
  let observer: ResizeObserver | undefined

  const reserve = () => {
    const height = footer.value?.getBoundingClientRect().height
    claimMapBerth(
      gameStore,
      key,
      height ? { bottom: Math.round(height) + BERTH_GAP_PX } : undefined
    )
    if (height) bands.set(key, Math.round(height))
    else bands.delete(key)
    publishBand()
  }

  const observe = (element: HTMLElement | undefined) => {
    observer?.disconnect()
    reserve()
    if (!element) return
    observer = new ResizeObserver(reserve)
    // border-box: the keyboard lift grows the footer's PADDING — the
    // content box never changes, so the default box would sleep through it
    observer.observe(element, { box: 'border-box' })
  }

  onMounted(() => observe(footer.value))

  // The footer can arrive after mount (a v-if'd console, a scene swap);
  // without this the observer would never attach.
  watch(footer, observe)

  onBeforeUnmount(() => {
    observer?.disconnect()
    claimMapBerth(gameStore, key, undefined)
    bands.delete(key)
    publishBand()
  })
}
