import { onUnmounted, ref, watch, type Ref } from 'vue'

/**
 * The self-expiring-list clock both toast surfaces ride (CheerToast,
 * NoticeToast): a 1s tick that runs only while entries exist, updating `now`
 * so TTL filters re-evaluate, and stopping itself when the list drains.
 *
 * `prune` runs each tick and must actually REMOVE expired entries from the
 * source list — a filter-on-render alone never empties the list, so the
 * interval outlived its last visible entry by the length of the session
 * (the leak this composable exists to close).
 */
export const useEphemeralTicker = (length: () => number, prune: () => void): Ref<number> => {
  const now = ref(Date.now())
  let ticker: ReturnType<typeof setInterval> | undefined

  const stop = () => {
    if (ticker) clearInterval(ticker)
    ticker = undefined
  }

  watch(
    length,
    count => {
      if (!count || ticker) return
      ticker = setInterval(() => {
        now.value = Date.now()
        prune()
        if (!length()) stop()
      }, 1000)
    },
    { immediate: true }
  )

  onUnmounted(stop)

  return now
}
