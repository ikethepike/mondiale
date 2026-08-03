import { onMounted, ref } from 'vue'
import type { LatLng } from '~~/lib/geo'
import { isMapClickEvent } from '~~/types/events.types'
import { useGameStore } from '~~/store/game.store'

/**
 * The pin-drop mode family (Pin the Landmark, Heritage Hunt): a map click
 * plants the player's pin, the first pin announces presence and folds the
 * photo dock out of the map's way. Views own WHEN a drop is legal (the
 * `canDrop` gate); everything after the click lives here — the two views
 * drifting apart on the latch/announce/collapse choreography is the bug this
 * module exists to prevent.
 */
export const usePinDrop = ({
  canDrop,
  announce,
  registerCleanup,
}: {
  canDrop: () => boolean
  announce: (event: { kind: 'presence' }) => void
  registerCleanup: (fn: () => void) => void
}) => {
  const gameStore = useGameStore()

  const pin = ref<LatLng | undefined>(undefined)
  /** Phone photo dock: open until the first pin needs the map readable. */
  const photoExpanded = ref(true)

  const onMapClick = (event: Event) => {
    if (!isMapClickEvent(event)) return
    if (!canDrop()) return

    const latLng = event.detail.latLng
    if (!latLng) return

    const first = !pin.value
    pin.value = latLng
    gameStore.map.pin = latLng
    if (first) {
      announce({ kind: 'presence' })
      photoExpanded.value = false
    }
  }

  onMounted(() => document.addEventListener('mapClick', onMapClick))
  registerCleanup(() => document.removeEventListener('mapClick', onMapClick))

  /** A fresh beat: no pin, no answer marker, photo back open. */
  const resetPin = () => {
    pin.value = undefined
    photoExpanded.value = true
    gameStore.map.pin = undefined
    gameStore.map.pinAnswer = undefined
  }

  return { pin, photoExpanded, resetPin }
}
