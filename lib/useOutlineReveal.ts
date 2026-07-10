import { nextTick, ref } from 'vue'
import { prefersReducedMotion } from '~~/lib/motion'
import { drawnFraction, mainlandOutline, previewSweepSeconds } from '~~/lib/outline'
import type { ISOCountryCode } from '~~/types/geography.types'

/** How long the whole border holds on screen before sweeping away. */
const PREVIEW_HOLD_MS = 1600

/**
 * The shared choreography of the outline-guessing modes (group Silhouette and
 * the individual outline-reveal gate): the full border flashes as a preview,
 * sweeps itself away, then draws back in against the round clock.
 *
 * All dash math runs in the path's REAL length units from getTotalLength(),
 * and the path must render in those same units (see mainlandOutline on why
 * non-scaling-stroke would shatter the dashes). The pathLength="1" trick is
 * a trap too: values written with px units (as animation libraries do)
 * bypass pathLength normalization in Chrome, leaving a frozen confetti of
 * 1px dashes. Real units + CSS transitions are boringly reliable, and they
 * make the pacing size-relative for free — covering the measured perimeter
 * in a fixed clock share means a longer border draws proportionally faster,
 * and every country completes on the same beat.
 */
export const useOutlineReveal = () => {
  /** The country's mainland ring, framed in its own padded viewBox. */
  const outline = ref<{ d: string; viewBox: string; span: number; strokeWidth: number }>()
  const outlinePath = ref<SVGPathElement>()

  type Phase = 'idle' | 'preview' | 'sweep' | 'drawing'
  let phase: Phase = 'idle'
  let length = 0
  let totalSeconds = 0
  let lastSecondsLeft = Infinity
  let drawStartSecondsLeft = 0
  let prepared: Promise<void> = Promise.resolve()
  // Bumped by reset so a begin still awaiting geometry can't arm a stale round.
  let generation = 0
  let previewTimer: ReturnType<typeof setTimeout> | undefined
  let sweepTimer: ReturnType<typeof setTimeout> | undefined

  const prepareOutline = (isoCode: ISOCountryCode) => {
    prepared = mainlandOutline(isoCode).then(frame => {
      outline.value = frame
    })
  }

  /**
   * Kick off preview → sweep → draw. Awaits the geometry (the HD chunk may
   * still be in flight) and its render, so callers just fire it — but they
   * must not gate their own clock on it: a missing outline no-ops here.
   * Under reduced motion the full outline simply stays put for the round.
   */
  const beginOutlineReveal = async (durationSeconds: number) => {
    const armed = generation
    await prepared
    await nextTick()
    const path = outlinePath.value
    const frame = outline.value
    length = path?.getTotalLength() ?? 0
    if (armed !== generation || !path || !frame || !length) return

    totalSeconds = durationSeconds
    // Ticks may already be running if the geometry arrived late.
    lastSecondsLeft = Math.min(lastSecondsLeft, durationSeconds)
    phase = 'preview'
    path.style.strokeDasharray = `${length}`
    path.style.transition = 'none'
    path.style.strokeDashoffset = '0'
    if (prefersReducedMotion()) return

    previewTimer = setTimeout(() => {
      // The sweep-away un-draws the border at a pace set by its intricacy —
      // the transition lands in the same style flush as the offset change,
      // and per spec the after-change style's transition applies.
      const sweep = previewSweepSeconds(length, frame.span)
      phase = 'sweep'
      path.style.transition = `stroke-dashoffset ${sweep}s ease-in`
      path.style.strokeDashoffset = `${length}`

      sweepTimer = setTimeout(() => {
        // Ticks land once per second; a matching linear transition chains
        // them into one continuous, ever-growing stroke.
        phase = 'drawing'
        drawStartSecondsLeft = lastSecondsLeft
        path.style.transition = 'stroke-dashoffset 1s linear'
      }, sweep * 1000)
    }, PREVIEW_HOLD_MS)
  }

  /** Countdown hook: advances the border by this tick's share of the clock. */
  const tickOutlineReveal = (secondsLeft: number) => {
    lastSecondsLeft = secondsLeft
    const path = outlinePath.value
    if (phase !== 'drawing' || !path || !length) return
    const drawn = drawnFraction(secondsLeft, totalSeconds, drawStartSecondsLeft)
    path.style.strokeDashoffset = `${length * (1 - drawn)}`
  }

  /** Clear timers and state — round cleanup and back-to-back gate resets. */
  const resetOutlineReveal = () => {
    if (previewTimer) clearTimeout(previewTimer)
    if (sweepTimer) clearTimeout(sweepTimer)
    previewTimer = undefined
    sweepTimer = undefined
    generation++
    phase = 'idle'
    length = 0
    lastSecondsLeft = Infinity
    prepared = Promise.resolve()
    outline.value = undefined
  }

  return {
    outline,
    outlinePath,
    prepareOutline,
    beginOutlineReveal,
    tickOutlineReveal,
    resetOutlineReveal,
  }
}
