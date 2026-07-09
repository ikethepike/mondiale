import type { ISOCountryCode } from './geography.types'

export interface CountryColorGrouping {
  color: string
  countries: Array<ISOCountryCode | string>
}

/**
 * A physical-geography overlay drawn on top of the countries (water modes):
 * rivers render as lines that draw themselves in, seas/lakes/ranges as
 * soft-filled areas. Geometry comes from data/water.gen.ts.
 */
export interface MapFeatureOverlay {
  d: string
  kind: 'line' | 'area'
  /** Projected bbox — included in the camera frame when present. */
  bounds?: [number, number, number, number]
  /**
   * A ringed pin at this projected point, drawn on top of `d`.
   *
   * Some contested territories are sub-pixel at world zoom — Rockall spans
   * about 300 metres — so their outline renders as nothing at all. The marker
   * says "the argument is *here*" even when the thing itself is invisible.
   */
  marker?: { x: number; y: number }
}

/**
 * A magnifying inset: a second, tighter viewport onto the same map, drawn in a
 * corner with a leader line back to the region it shows.
 *
 * Some things a round asks about are simply too small to see at world zoom —
 * Bassas da India is a third of a projected unit across, the Courantyne
 * Headwaters twelve, against a 2000-unit-wide world. Highlighting them harder
 * does not help: a dot big enough to notice is bigger than the territory.
 *
 * Any mode can use this. The subject need not be a `feature`; it is just a box
 * in projected map space, so a country, a pin or a water body works too.
 */
export interface MapInset {
  /** The region to magnify, in projected map space: [x, y, width, height]. */
  bounds: [number, number, number, number]
  /**
   * Hide the inset once the camera is zoomed at least this far, by which point
   * the subject is legible unaided. Defaults to a modest zoom.
   */
  hideAtZoom?: number
  /** Optional caption drawn under the box ("Hans Island"). */
  label?: string
}
