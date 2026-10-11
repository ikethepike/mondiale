import { clamp01 } from './number'

/**
 * The one warmth language for every "how close are you" read-out — Hot &
 * Cold's kilometres and The Despot's sonar borders paint the same ramp, so a
 * player who learned one reads the other. 0 is on top of it, 1 as far as the
 * read-out goes. Stops mirror flame() and ember() in rules/_ink.scss and the
 * --soft-blue token; JS needs the literals.
 */
const WARMTH_STOPS: [number, [number, number, number]][] = [
  [0, [231, 76, 60]],
  [0.3, [236, 143, 64]],
  [0.55, [226, 196, 120]],
  [0.75, [150, 190, 205]],
  [1, [52, 120, 160]],
]

export const warmthColor = (fraction: number, alpha = 1): string => {
  const at = clamp01(fraction)
  const upper = WARMTH_STOPS.findIndex(([stop]) => stop >= at)
  const [toStop, to] = WARMTH_STOPS[Math.max(0, upper)]!
  const [fromStop, from] = WARMTH_STOPS[Math.max(0, upper - 1)]!
  const mix = toStop === fromStop ? 0 : (at - fromStop) / (toStop - fromStop)
  const [r, g, b] = from.map((channel, index) => Math.round(channel + (to[index]! - channel) * mix))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
