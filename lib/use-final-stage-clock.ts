import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { useServerWindow } from '~~/lib/use-server-window'

/**
 * A gauntlet stage's clock: the question's server deadline, counted back by
 * the stage's own length. The stage is keyed on its question's subject, so the
 * deadline it reads is always its own; before the clock starts (the opening
 * card, the camera's flight) it reads full.
 */
export const useFinalStageClock = (totalSeconds: MaybeRefOrGetter<number>) => {
  const { seatCursor } = useClientEvents()
  const subject = seatCursor.value?.subject
  const deadline = computed(() =>
    seatCursor.value?.subject === subject ? seatCursor.value?.deadline : undefined
  )
  const window = useServerWindow(
    () =>
      deadline.value === undefined ? undefined : deadline.value - toValue(totalSeconds) * 1000,
    totalSeconds
  )
  return { ...window, startsAt: window.opensAt }
}
