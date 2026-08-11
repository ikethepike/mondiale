/** A wrong buzz costs a beat — long enough to matter, short enough to re-enter
 *  the same round. Shared so no two rounds can drift apart. */
export const BUZZ_LOCKOUT_MS = 3000

/** The lockout's length as the hint copy says it — derived, so tuning the beat
 *  can never leave six views promising a duration the clock no longer serves. */
export const LOCKOUT_SECONDS = BUZZ_LOCKOUT_MS / 1000

/**
 * The wrong-answer lockout every buzz-shaped round shares: one timer, one
 * length, and the seamless hand-back — `onEnd` runs after the DOM patch that
 * re-enables the console, so a refocus there always lands on an enabled
 * input. Owned here because a view-side timer re-declares the lockout length
 * and can silently drop the refocus.
 */
export const useLockoutBeat = (options: { onEnd?: () => void } = {}) => {
  const lockedOut = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  const lockOut = () => {
    lockedOut.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      lockedOut.value = false
      nextTick(() => options.onEnd?.())
    }, BUZZ_LOCKOUT_MS)
  }

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })

  return { lockedOut, lockOut }
}
