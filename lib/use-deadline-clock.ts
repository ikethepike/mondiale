import { onBeforeUnmount, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { remainingFractionOn } from './round-beats'

/** Repaint cadence — fast enough that a 1s tick never visibly stutters. */
const REPAINT_MS = 200

/** Seconds left on a server-stamped deadline: the ceiled remainder, never
 *  negative. THE deadline→seconds math — useGroupChallenge's countdown reads
 *  it too, so the two clocks can never round differently. */
export const secondsOnDeadline = (deadline: number): number =>
  Math.max(0, Math.ceil((deadline - Date.now()) / 1000))

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
    const at = toValue(deadline) ?? 0
    secondsOnClock.value = secondsOnDeadline(at)
    fractionLeft.value = remainingFractionOn(at, toValue(totalSeconds))
  }

  repaint()
  const clock = setInterval(repaint, REPAINT_MS)
  onBeforeUnmount(() => clearInterval(clock))

  return { secondsOnClock, fractionLeft }
}
