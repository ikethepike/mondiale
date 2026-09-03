import { MAP_BOUNDS, MAP_REGIONS, type MapCode } from '~~/data/map.gen'
import { boxesIntersect, regionsIntersect, unionBox, type MapBox } from '~~/lib/geo'
import { SUNSET_TILT, sunsetDuskCoordinate } from '~~/lib/sunset-window'
import { bleedBox, type MapViewBox, type ScreenRect } from '~~/lib/use-map-viewbox'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The night as one moving plane: the sweep runs in map-space dusk coordinates
 * (lib/sunset-window) and lands on screen as a single compositor transform,
 * with the darkened land a static svg counter-transformed inside it. Both
 * ends of that seam — the ticker placing the plane and the view grading who
 * is dark — read this module, so the drawn line and the rule never disagree.
 */
export interface Viewport {
  width: number
  height: number
}

/** How far behind the terminator the land reaches full night, as a share of
 *  the viewport width — the veil mask's fade. */
export const SUNSET_VEIL_FEATHER = 0.2
/** Map units past the camera's edges the sweep starts and ends. */
export const SUNSET_SWEEP_MARGIN = 8
/** The plane's ease to full night once the clock runs out. */
export const SUNSET_SETTLE_MS = 1400
/** A country's own dusk — amber, then night — for the timed roll. */
export const SUNSET_DUSK_MS = 3600
/** Screen tilt of the terminator: the camera keeps the viewBox at the
 *  screen's aspect, so map-space tilt IS screen tilt. */
export const SUNSET_VEIL_TILT_DEG = -(SUNSET_TILT * 180) / Math.PI

const TAN = Math.tan(SUNSET_TILT)
const SIN = Math.sin(SUNSET_TILT)
const COS = Math.cos(SUNSET_TILT)
// The plane's left edge is bowed (border-radius); the settled push clears it.
const BOW_SHARE = 0.05

/** The sweep's map-space bounds for a camera: the night enters from off the
 *  east edge and has fully crossed the west edge when the clock runs out. */
export const sweepBounds = (vb: MapViewBox): { start: number; end: number } => ({
  start: vb.x + vb.w - vb.y * TAN + SUNSET_SWEEP_MARGIN,
  end: vb.x - (vb.y + vb.h) * TAN - SUNSET_SWEEP_MARGIN,
})

/**
 * How many of `field` the night has taken. The field is sorted east→west by
 * dusk coordinate, so the dark countries are always its leading run — one
 * integer, changing only as a country crosses, is the whole dark set.
 */
export const darkPrefixCount = (field: readonly ISOCountryCode[], dusk: number): number => {
  let count = 0
  while (count < field.length && sunsetDuskCoordinate(field[count]!) >= dusk) count++
  return count
}

/** Where the terminator crosses the map's vertical centre, in viewport px. */
export const veilMidPx = (vb: MapViewBox, dusk: number, rect: ScreenRect): number =>
  rect.x + ((dusk + (vb.y + vb.h / 2) * TAN - vb.x) / vb.w) * rect.width

/** The plane pushed far enough west that its opaque night covers every
 *  viewport corner (relative to the plane's origin, the map's centre). */
export const settledMidPx = (viewport: Viewport): number =>
  -(viewport.width * (SUNSET_VEIL_FEATHER + BOW_SHARE) + (viewport.height / 2) * SIN) / COS -
  SUNSET_SWEEP_MARGIN

/**
 * A plane box that covers the viewport east of the line for every position
 * the sweep visits, from just off the east edge to `settledMidPx`. Rotation
 * about the left-centre origin swings the far end by `width·sinθ`, so the
 * height carries that on both sides.
 */
export const veilPlaneSize = (viewport: Viewport): Viewport => {
  const reach = viewport.width - settledMidPx(viewport) + (viewport.height / 2) * SIN
  const width = reach / COS + SUNSET_SWEEP_MARGIN
  return { width, height: viewport.height + 2 * width * SIN }
}

/** The plane's transform and the exact inverse its land layer wears. Only
 *  `midPx` moves, so both interpolate in lockstep under one transition. */
export const veilTransforms = (midPx: number): { plane: string; inverse: string } => ({
  plane: `translateX(${midPx}px) rotate(${SUNSET_VEIL_TILT_DEG}deg)`,
  inverse: `rotate(${-SUNSET_VEIL_TILT_DEG}deg) translateX(${-midPx}px)`,
})

const asBox = (vb: MapViewBox): MapBox => [vb.x, vb.y, vb.w, vb.h]

/** Every map shape the camera can see — the night takes them all, windowed,
 *  pooled or not. Bled past the edges like every camera-pinned overlay. */
export const veilCodes = (vb: MapViewBox): MapCode[] => {
  const box = asBox(bleedBox(vb))
  return (Object.keys(MAP_BOUNDS) as MapCode[]).filter(code =>
    regionsIntersect(MAP_REGIONS[code] ?? [MAP_BOUNDS[code]!], box)
  )
}

const ringsOf = (code: MapCode): MapBox[] =>
  MAP_REGIONS[code]?.length ? MAP_REGIONS[code] : [MAP_BOUNDS[code]!]

/** A country's whole footprint (every ring) in map space. */
export const regionBox = (code: MapCode): MapBox => unionBox(ringsOf(code))

const clipBox = ([x, y, w, h]: MapBox, [cx, cy, cw, ch]: MapBox): MapBox => {
  const left = Math.max(x, cx)
  const top = Math.max(y, cy)
  return [left, top, Math.min(x + w, cx + cw) - left, Math.min(y + h, cy + ch) - top]
}

/** The part of a country's footprint the camera can see: only the rings on
 *  screen, clipped to the bled camera — Russia seen through Kaliningrad is a
 *  Kaliningrad-sized box, never a map-spanning one. */
export const visibleRegionBox = (code: MapCode, vb: MapViewBox): MapBox => {
  const box = asBox(bleedBox(vb))
  const rings = ringsOf(code).filter(ring => boxesIntersect(ring, box))
  return clipBox(unionBox(rings.length ? rings : ringsOf(code)), box)
}

/** Where the line has cleared a country's WESTERN edge — the timed roll's
 *  cue, so a giant like Russia isn't blacked out far ahead of the front. */
export const duskWestCoordinate = (code: MapCode): number => {
  const rings = MAP_REGIONS[code]
  if (!rings?.length) return sunsetDuskCoordinate(code as ISOCountryCode)
  const [x, y, , height] = rings[0]!
  return x - (y + height / 2) * TAN
}

/** A map-space box as a screen box, in the map's painted rect's px. */
export const boxToScreen = (box: MapBox, vb: MapViewBox, rect: ScreenRect): ScreenRect => ({
  x: rect.x + ((box[0] - vb.x) / vb.w) * rect.width,
  y: rect.y + ((box[1] - vb.y) / vb.h) * rect.height,
  width: (box[2] / vb.w) * rect.width,
  height: (box[3] / vb.h) * rect.height,
})
