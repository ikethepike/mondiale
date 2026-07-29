import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import { useClientEvents } from '~~/lib/events/client-side'

/**
 * The map-side half of the standard bottom placement: a challenge whose
 * subject must stay visible hands its footer to this composable, and the
 * camera frames the subject in the clear band above it (gameStore.map.berth).
 * A ResizeObserver keeps the reservation honest — the software-keyboard lift
 * grows the footer's padding, so the camera glides up as the keyboard rises
 * instead of letting the console park over the framed country. Cleared on
 * unmount; clearBoard covers round changes.
 */
export const useFooterBerth = (footer: Ref<HTMLElement | undefined>) => {
  const { gameStore } = useClientEvents()
  let observer: ResizeObserver | undefined

  const reserve = () => {
    const height = footer.value?.getBoundingClientRect().height
    gameStore.map.berth = height ? { bottom: Math.round(height) + 12 } : undefined
  }

  onMounted(() => {
    reserve()
    if (!footer.value) return
    observer = new ResizeObserver(reserve)
    // border-box: the keyboard lift grows the footer's PADDING — the
    // content box never changes, so the default box would sleep through it
    observer.observe(footer.value, { box: 'border-box' })
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    gameStore.map.berth = undefined
  })
}
