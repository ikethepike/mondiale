// Motion tokens — the TS mirror of assets/scss/rules/_motion.scss.
// Keep the two files in sync by hand; they are small on purpose.

/** Durations in seconds (GSAP convention). */
export const MOTION = {
  /** Micro feedback: ticks, pulses */
  quick: 0.18,
  /** Cross-fades, view swaps */
  base: 0.36,
  /** Entrances, reveal card */
  slow: 0.6,
  /** Ambient loops (breathing panes, drifting backdrops) */
  ambient: 6,
} as const

/**
 * How long transient copy stays on screen, in ms. Not a motion token — nothing
 * in `_motion.scss` mirrors these — but the same reason to keep one source:
 * the nine views that flash a hint had drifted between 2000 and 2200.
 */
export const DWELL = {
  /** A wrong-guess hint over the map, and its chip in the live-guess ticker. */
  hint: 2200,
  /** A taunt is a sentence, not a verdict — it lingers long enough to land. */
  taunt: 5200,
} as const

/**
 * How long a reveal holds its first act before the second, in ms. Long enough
 * for the caption fades (--motion-base) to finish and a sparkline to read, so
 * the follow-up settles the cards rather than colliding with them.
 */
export const REVEAL_BEAT_MS = 700

/** GSAP ease names matching the CSS custom-property easings. */
export const EASE = {
  /** Entrances — matches --ease-out-expressive */
  enter: 'expo.out',
  /** Cross-fades — matches --ease-smooth */
  cross: 'power2.inOut',
  /** Exits — matches --ease-in-soft */
  exit: 'power2.in',
} as const

// Cached once: per-frame callers (the board's train, boat and smoke) must
// not construct a fresh MediaQueryList every tick. `.matches` stays live.
let reducedMotionQuery: MediaQueryList | undefined

export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false
  reducedMotionQuery ??= window.matchMedia('(prefers-reduced-motion: reduce)')
  return reducedMotionQuery.matches
}

// Cached: called per mount, and the answer cannot change within a session.
let modestDevice: boolean | undefined

/**
 * A device that should be spared decorative extras.
 *
 * The cost is SETUP, not the animation: the loops are transform and opacity,
 * but at 6x CPU throttle a backdrop takes ~2s to first paint against a 4.5s
 * card — half the beat blank, which is worse than the plain card it replaced.
 *
 * `deviceMemory` is advisory and absent outside Chromium, so a missing answer
 * is treated as capable. `hardwareConcurrency` looks like the same kind of
 * signal and is not: Safari clamps it to 4 on every iPhone as a fingerprinting
 * defence, so reading it undressed the interstitial on the fastest phones we
 * ship to.
 */
export const prefersLightMotion = (): boolean => {
  if (typeof window === 'undefined') return false
  if (modestDevice !== undefined) return modestDevice
  const nav = navigator as Navigator & { deviceMemory?: number }
  const memory = nav.deviceMemory
  modestDevice = prefersReducedMotion() || (memory !== undefined && memory <= 4)
  return modestDevice
}
