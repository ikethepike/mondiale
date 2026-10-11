import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { remainingFractionOn } from './round-beats'
import { useServerNow } from './use-server-now'

/** Seconds left on a server-stamped deadline at server time `now`: the ceiled
 *  remainder, never negative, 0 while unstamped. THE deadline→seconds math —
 *  every countdown reads it, so no two clocks can round differently. */
export const secondsOnDeadline = (deadline: number | undefined, now: number): number =>
  deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0

/**
 * The shot clock for a server-stamped deadline: the server stamps it, the
 * view only reads it against the shared server clock. `fractionLeft` is
 * `remainingFractionOn` — the same math the bot brain prices its buzz with —
 * which reads full when no `totalSeconds` was supplied (no window to be early
 * in) and empty while the deadline is still unstamped, so it never disagrees
 * with `secondsOnClock` about whether a clock is running.
 */
export const useDeadlineClock = (
  deadline: MaybeRefOrGetter<number | undefined>,
  totalSeconds?: MaybeRefOrGetter<number | undefined>
) => {
  const { now } = useServerNow()
  const secondsOnClock = computed(() => secondsOnDeadline(toValue(deadline), now.value))
  const fractionLeft = computed(() =>
    remainingFractionOn(toValue(deadline), toValue(totalSeconds), now.value)
  )
  return { secondsOnClock, fractionLeft }
}
