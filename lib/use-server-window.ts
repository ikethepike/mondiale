import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { clamp } from '~~/lib/number'
import { useServerNow } from '~~/lib/use-server-now'

/**
 * A timed window measured on the server clock: it opens at a server stamp and
 * runs `totalSeconds`. Every multi-beat schedule a view paces (a clue ladder,
 * a headline drip, a dusk sweep) is this window's elapsed time — never a local
 * interval — so a throttled tab, a booth watcher and the racer all read the
 * same moment. Unstamped, the window reads FULL and never expires.
 */
export const useServerWindow = (
  startsAt: MaybeRefOrGetter<number | undefined>,
  totalSeconds: MaybeRefOrGetter<number>
) => {
  const { now } = useServerNow()
  const totalMs = computed(() => toValue(totalSeconds) * 1000)
  const opensAt = computed(() => toValue(startsAt))
  const frozenMs = ref<number>()

  const elapsedMs = computed(() => {
    if (frozenMs.value !== undefined) return frozenMs.value
    if (opensAt.value === undefined) return 0
    return clamp(now.value - opensAt.value, 0, totalMs.value)
  })
  const running = computed(() => opensAt.value !== undefined && now.value >= opensAt.value)
  const secondsLeft = computed(() =>
    Math.max(0, Math.ceil((totalMs.value - elapsedMs.value) / 1000))
  )
  const expired = computed(
    () =>
      frozenMs.value === undefined &&
      opensAt.value !== undefined &&
      now.value >= opensAt.value + totalMs.value
  )
  /** Hold the window where it stands (the view resolved early). */
  const stop = () => {
    frozenMs.value ??= elapsedMs.value
  }

  return { now, opensAt, elapsedMs, running, secondsLeft, expired, stop }
}
