import gsap from 'gsap'
import { EASE, MOTION } from '~~/lib/motion'
import { parsePolygons, ringArea, ringCentroid as centroid } from '~~/lib/outline'

/**
 * The Ghosts of Empires morph engine: turns an empire's keyframe paths into
 * one continuously-morphing `d` stream, with the year and the ghost's ink
 * opacity riding the same clock.
 *
 * flubber does the ring interpolation (including 1→n splits and n→1 merges —
 * an empire fragmenting into republics); GSAP drives progress on a numeric
 * proxy because only Chromium animates geometry attributes (the MapInset
 * lesson). Every frame goes out through `onFrame` for a direct
 * `setAttribute('d', …)` write — Vue's vnode diff never sees per-frame
 * geometry (the GameMap discipline).
 */

type Ring = [number, number][]
type RingInterpolator = (t: number) => string

interface Flubber {
  interpolate: (from: Ring | string, to: Ring | string, options?: object) => RingInterpolator
  separate: (from: Ring | string, to: (Ring | string)[], options?: object) => RingInterpolator
  combine: (from: (Ring | string)[], to: Ring | string, options?: object) => RingInterpolator
}

/** Ink levels the sweep narrates with: rise → peak dwell → decline. The
 *  dissolution fade to 0 is the timeline's grave-pause, not an ink level. */
const INK = { rise: 0.2, peak: 0.42, decline: 0.18 }
/** Dwell at the peak — the shape the player must carry into beat 2. */
const PEAK_DWELL_SECONDS = 2
const START_HOLD_SECONDS = 0.8
const FADE_SECONDS = 0.6
/** One full pass lands ~14–19s — deliberate, readable; a 28s clock still
 *  shows the whole story once and most of it twice. */
const SEGMENT_BASE_SECONDS = 1.8
const SEGMENT_POOL_SECONDS = 9

const distance = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])

/**
 * Pair rings across two keyframes for morphing: the min(n,m) largest rings
 * pair greedily by centroid distance; every leftover ring on the larger side
 * joins its nearest pair's group. Each group is then 1→1, 1→k or k→1 —
 * exactly the cases flubber's interpolate/separate/combine cover, with no
 * dependence on interpolateAll's unequal-length behaviour.
 */
const pairRings = (from: Ring[], to: Ring[]): { from: Ring[]; to: Ring[] }[] => {
  const paired = Math.min(from.length, to.length)
  const groups: { from: Ring[]; to: Ring[]; centre: [number, number] }[] = []
  const takenTo = new Set<number>()

  for (let i = 0; i < paired; i++) {
    const fromCentre = centroid(from[i])
    let best = -1
    let bestDistance = Infinity
    for (let j = 0; j < to.length; j++) {
      if (takenTo.has(j)) continue
      const d = distance(fromCentre, centroid(to[j]))
      if (d < bestDistance) {
        bestDistance = d
        best = j
      }
    }
    takenTo.add(best)
    groups.push({ from: [from[i]], to: [to[best]], centre: fromCentre })
  }

  for (let i = paired; i < from.length; i++) {
    const centre = centroid(from[i])
    const nearest = groups.reduce((a, b) =>
      distance(centre, a.centre) <= distance(centre, b.centre) ? a : b
    )
    nearest.from.push(from[i])
  }
  for (let j = 0; j < to.length; j++) {
    if (takenTo.has(j)) continue
    const centre = centroid(to[j])
    const nearest = groups.reduce((a, b) =>
      distance(centre, a.centre) <= distance(centre, b.centre) ? a : b
    )
    nearest.to.push(to[j])
  }

  return groups
}

let flubberPromise: Promise<Flubber> | undefined
const loadFlubber = () => (flubberPromise ??= import('flubber') as unknown as Promise<Flubber>)

export interface EmpireMorphHooks {
  /** Direct-DOM frame: the current path and the ghost's fill opacity. */
  onFrame: (d: string, opacity: number) => void
  /** Fires only when the integer year changes — write textContent, no refs. */
  onYear: (year: number) => void
  /** Per-frame position along the arc, t ∈ [0, K−1] — drives the timebar's
   *  progress fill (direct DOM writes downstream, like onFrame). */
  onProgress?: (t: number) => void
}

export const useEmpireMorph = (hooks: EmpireMorphHooks) => {
  let segments: RingInterpolator[] = []
  let years: number[] = []
  let peakIndex = 0
  let timeline: gsap.core.Timeline | undefined
  const proxy = { t: 0, fade: 1 }
  let lastYear = Number.NaN

  /** Piecewise ink level over global t: rise into the peak, drain after it. */
  const inkAt = (t: number): number => {
    if (peakIndex <= 0)
      return t <= 0
        ? INK.peak
        : gsap.utils.mapRange(0, Math.max(1, years.length - 1), INK.peak, INK.decline, t)
    if (t <= peakIndex) return INK.rise + (INK.peak - INK.rise) * (t / peakIndex)
    const tail = Math.max(1, years.length - 1 - peakIndex)
    return INK.peak + (INK.decline - INK.peak) * ((t - peakIndex) / tail)
  }

  const apply = () => {
    if (!segments.length) return
    const clamped = gsap.utils.clamp(0, segments.length, proxy.t)
    const index = Math.min(segments.length - 1, Math.floor(clamped))
    const progress = gsap.utils.clamp(0, 1, clamped - index)
    hooks.onFrame(segments[index](progress), inkAt(clamped) * proxy.fade)
    hooks.onProgress?.(clamped)

    const year = Math.round(
      years[index] + (years[Math.min(index + 1, years.length - 1)] - years[index]) * progress
    )
    if (year !== lastYear) {
      lastYear = year
      hooks.onYear(year)
    }
  }

  /**
   * Build the K−1 segment interpolators once. Microtask-staggered so an
   * 8-keyframe monster doesn't jank the interstitial's exit frame.
   */
  const build = async (paths: string[], keyframeYears: number[], peak: number) => {
    const flubber = await loadFlubber()
    years = keyframeYears
    peakIndex = Math.max(0, keyframeYears.indexOf(peak))

    const frames = paths.map(d => {
      const rings = (parsePolygons(d) as Ring[]).filter(ring => ring.length >= 3)
      return rings.sort((a, b) => ringArea(b) - ringArea(a))
    })
    const span =
      Math.max(...frames.flatMap(rings => rings.flatMap(ring => ring.map(([x]) => x)))) -
      Math.min(...frames.flatMap(rings => rings.flatMap(ring => ring.map(([x]) => x))))
    // Densification floor: enough added vertices for fluid curves without
    // drowning small empires in points.
    const maxSegmentLength = Math.max(1, span / 150)

    segments = []
    for (let index = 0; index < frames.length - 1; index++) {
      const groups = pairRings(frames[index], frames[index + 1])
      const parts = groups.map(group => {
        if (group.from.length === 1 && group.to.length === 1)
          return flubber.interpolate(group.from[0], group.to[0], { maxSegmentLength })
        if (group.from.length === 1)
          return flubber.separate(group.from[0], group.to, { maxSegmentLength, single: true })
        return flubber.combine(group.from, group.to[0], { maxSegmentLength, single: true })
      })
      segments.push(parts.length === 1 ? parts[0] : t => parts.map(part => part(t)).join(' '))
      await Promise.resolve()
    }
    lastYear = Number.NaN
  }

  /** Span-weighted segment seconds: slow bloom, fast shatter — sqrt keeps a
   *  400-year rise from dwarfing a 20-year collapse. */
  const segmentDurations = (): number[] => {
    const spans = years.slice(1).map((year, index) => Math.sqrt(Math.max(1, year - years[index])))
    const total = spans.reduce((sum, span) => sum + span, 0)
    return spans.map(span => SEGMENT_BASE_SECONDS + (SEGMENT_POOL_SECONDS * span) / total)
  }

  /** Loop the full arc until stopped — the second pass is the hint engine. */
  const play = () => {
    stop()
    proxy.t = 0
    proxy.fade = 1
    timeline = gsap.timeline({ repeat: -1, repeatDelay: 0.8, onUpdate: apply })
    timeline.set(proxy, { t: 0, fade: 1 })
    timeline.to({}, { duration: START_HOLD_SECONDS })
    const durations = segmentDurations()
    for (let index = 0; index < segments.length; index++) {
      timeline.to(proxy, { t: index + 1, duration: durations[index], ease: EASE.cross })
      if (index + 1 === peakIndex) timeline.to({}, { duration: PEAK_DWELL_SECONDS })
    }
    // The grave-pause: the last extent fades out before the loop seam.
    timeline.to(proxy, { fade: 0, duration: FADE_SECONDS, ease: EASE.exit })
    apply()
  }

  /** Kill the loop and glide (or snap) to the frozen peak frame. */
  const freezeAtPeak = (animated: boolean) => {
    stop()
    if (!animated) {
      proxy.t = peakIndex
      proxy.fade = 1
      apply()
      return
    }
    gsap.to(proxy, {
      t: peakIndex,
      fade: 1,
      duration: MOTION.slow,
      ease: EASE.cross,
      onUpdate: apply,
    })
  }

  /** Scrubber and reduced-motion entry point: synchronous frame write. */
  const seek = (t: number) => {
    stop()
    proxy.t = t
    proxy.fade = 1
    apply()
  }

  const stop = () => {
    timeline?.kill()
    timeline = undefined
    gsap.killTweensOf(proxy)
  }

  const dispose = () => {
    stop()
    segments = []
  }

  return {
    build,
    play,
    freezeAtPeak,
    seek,
    stop,
    dispose,
    get segmentCount() {
      return segments.length
    },
  }
}
