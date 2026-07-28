import { onBeforeUnmount, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { clamp01 } from './number'

/** Repaint cadence — fast enough that a 1s tick never visibly stutters. */
const REPAINT_MS = 200

/**
 * The shot clock for server-owned deadlines (border-chain, timeline,
 * heritage-hunt, manhunt): the server stamps `deadline`, the client only
 * repaints. `secondsOnClock` is the ceiled remainder, never negative;
 * `fractionLeft` divides by `totalSeconds` when one is supplied (1 when not).
 * Cleans itself up on unmount.
 */
export const useDeadlineClock = (
  deadline: MaybeRefOrGetter<number | undefined>,
  totalSeconds?: MaybeRefOrGetter<number | undefined>
) => {
  const secondsOnClock = ref(0)
  const fractionLeft = ref(1)

  const repaint = () => {
    const remaining = (toValue(deadline) ?? 0) - Date.now()
    secondsOnClock.value = Math.max(0, Math.ceil(remaining / 1000))
    const total = (toValue(totalSeconds) ?? 0) * 1000
    fractionLeft.value = total ? clamp01(remaining / total) : 1
  }

  repaint()
  const clock = setInterval(repaint, REPAINT_MS)
  onBeforeUnmount(() => clearInterval(clock))

  return { secondsOnClock, fractionLeft }
}
