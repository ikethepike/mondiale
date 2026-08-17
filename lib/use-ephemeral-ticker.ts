import { onUnmounted, ref, watch, type Ref } from 'vue'

/**
 * The self-expiring-list clock both toast surfaces ride (CheerToast,
 * NoticeToast): a 1s tick that runs only while entries exist, updating `now`
 * so TTL filters re-evaluate, and stopping itself once the list drains.
 *
 * The ticker OWNS the prune — callers hand it the list's accessors and the
 * TTL, never their own filter closure. A render-side filter alone never
 * empties the store, so the interval outlived its last visible entry by the
 * length of the session (the leak this composable exists to close), and a
 * third hand-rolled prune is how the cheer/notice TTLs drifted apart.
 */
export const useEphemeralTicker = <T extends { at: number }>(
  get: () => readonly T[],
  set: (fresh: T[]) => void,
  ttlMs: number
): Ref<number> => {
  const now = ref(Date.now())
  let ticker: ReturnType<typeof setInterval> | undefined

  const stop = () => {
    if (ticker) clearInterval(ticker)
    ticker = undefined
  }

  watch(
    () => get().length,
    count => {
      if (!count || ticker) return
      ticker = setInterval(() => {
        now.value = Date.now()
        const entries = get()
        const fresh = entries.filter(entry => entry.at > now.value - ttlMs)
        if (fresh.length !== entries.length) set(fresh)
        if (!get().length) stop()
      }, 1000)
    },
    { immediate: true }
  )

  onUnmounted(stop)

  return now
}
