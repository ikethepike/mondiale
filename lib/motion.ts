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
} as const

/** GSAP ease names matching the CSS custom-property easings. */
export const EASE = {
  /** Entrances — matches --ease-out-expressive */
  enter: 'expo.out',
  /** Cross-fades — matches --ease-smooth */
  cross: 'power2.inOut',
  /** Exits — matches --ease-in-soft */
  exit: 'power2.in',
} as const

export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
