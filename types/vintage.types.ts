import type { ISOCountryCode } from './geography.types'

export const VINTAGE_REGION_IDS = ['africa', 'europe'] as const
export type VintageRegionId = (typeof VINTAGE_REGION_IDS)[number]

/**
 * Whose wash a unit wears: a colony takes its ruler's, and the land empires
 * that dissolved inside the timeline (Germany to 1918, Austria-Hungary, the
 * Russian Empire, the Soviet Union, the Ottomans) wear their own. Every other
 * independent state is bare paper.
 */
export const VINTAGE_WASHES = [
  'gb',
  'fr',
  'pt',
  'be',
  'es',
  'it',
  'de',
  'za',
  'dk',
  'at-hu',
  'ru',
  'su',
  'tr',
  'contested',
] as const
export type VintageWash = (typeof VINTAGE_WASHES)[number]

export interface VintageEra {
  name: string
  wash?: VintageWash
  /** A sovereign state in its own right — what the timebar counts. */
  sovereign: boolean
}

/** One curated era of a CShapes unit: in force from `from` (a year) onward. */
export interface VintageEraSpec extends VintageEra {
  from: number
}

export interface VintageUnitSpec {
  /** The modern country this unit became, for its flag. */
  iso?: ISOCountryCode
  eras: VintageEraSpec[]
}

/** A unit's look: which outline it wears and which era names it; -1 = absent. */
export type VintageUnitLook = [shape: number, era: number]

/**
 * One change between consecutive scenes. Carries both sides of every unit it
 * touches, so a step plays backward (the rewind) as readily as forward.
 */
export interface VintageStep {
  erase: number[]
  draw: number[]
  /** [unit, beforeShape, beforeEra, afterShape, afterEra]. */
  units: [number, number, number, number, number][]
  /** A border that moved: the chain that left and the chain that replaced it,
   *  both oriented between the same two junctions (signed arc indices). */
  slides: { from: number[]; to: number[] }[]
}

export interface VintageShape {
  /** Rings as signed arc indices (topojson's ~i for a reversed arc). */
  rings: number[][]
  anchor: [number, number]
  /** Inscribed radius at the anchor, in map units — a label's height budget. */
  room: number
  /** Width of the horizontal run through the anchor that a centred label can
   *  use, in map units — its width budget. */
  span: number
}

/**
 * A region's whole map history with no years in it: the client renders and
 * animates from this, and nothing here can be turned into an answer. The
 * years live server-side in `VintageRegionYears`.
 */
export interface VintageRegion {
  frame: [number, number, number, number]
  /** Projected arc geometry, flat [x0, y0, x1, y1, …]. */
  arcs: number[][]
  shapes: VintageShape[]
  /** `tone` picks a paper shade no neighbour ever shares. */
  units: { gwcode: number; iso?: ISOCountryCode; tone: number }[]
  eras: VintageEra[]
  /** The oldest scene, whole: borders drawn and each unit's look. */
  first: { borders: number[]; looks: VintageUnitLook[] }
  /** steps[i] turns scene i into scene i + 1; the last scene is 2019. */
  steps: VintageStep[]
}

export interface VintageRegionYears {
  /** First and last year (inclusive) of each scene. */
  spans: [number, number][]
  /** Scenes sharing a class look identical on screen — per label mode. */
  classes: { labelled: number[]; bare: number[] }
  /** Units that differ from 2019 on screen, per scene — per label mode. */
  tells: { labelled: number[]; bare: number[] }
  /** How much each step changes, which paces its share of the rewind. */
  weights: { labelled: number[]; bare: number[] }
  /** Sovereign states in the region, per year from `firstYear`. */
  states: number[]
  firstYear: number
  /** One-line notes keyed `${gwcode}:${year}`. */
  notes: Record<string, string>
}
