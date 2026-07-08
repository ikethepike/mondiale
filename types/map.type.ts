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
}
