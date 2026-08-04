import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { BERTH_GAP_PX, claimMapBerth } from '~~/lib/map-berth'

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
  })
}
