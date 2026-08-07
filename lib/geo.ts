import { COUNTRIES } from '~~/data/countries.gen'
import type { ISOCountryCode } from '~~/types/geography.types'

export interface LatLng {
  lat: number
  lng: number
}

/** Parse the factbook coordinate strings, e.g. "62 00 N, 15 00 E". */
export const parseCoordinates = (raw: string | undefined): LatLng | undefined => {
  if (!raw) return undefined
  const match = raw.match(/(\d+)\s+(\d+)\s*([NS])\s*,\s*(\d+)\s+(\d+)\s*([EW])/i)
  if (!match) return undefined

  const lat = (Number(match[1]) + Number(match[2]) / 60) * (match[3].toUpperCase() === 'S' ? -1 : 1)
  const lng = (Number(match[4]) + Number(match[5]) / 60) * (match[6].toUpperCase() === 'W' ? -1 : 1)
  return { lat, lng }
}

export const countryLatLng = (isoCode: ISOCountryCode): LatLng | undefined =>
  parseCoordinates(COUNTRIES[isoCode]?.coordinates)

const toRadians = (degrees: number) => (degrees * Math.PI) / 180
const toDegrees = (radians: number) => (radians * 180) / Math.PI

/** Great-circle distance in kilometres. */
export const haversineKm = (a: LatLng, b: LatLng): number => {
  const earthRadiusKm = 6371
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Initial bearing from a to b, degrees clockwise from north. */
export const bearingDegrees = (a: LatLng, b: LatLng): number => {
  const dLng = toRadians(b.lng - a.lng)
  const y = Math.sin(dLng) * Math.cos(toRadians(b.lat))
  const x =
    Math.cos(toRadians(a.lat)) * Math.sin(toRadians(b.lat)) -
    Math.sin(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.cos(dLng)
  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}

const COMPASS_POINTS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
]

export const compassLabel = (bearing: number): string =>
  COMPASS_POINTS[Math.round(bearing / 45) % 8]

const COMPASS_ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']

/** "12.5°N, 3.2°E" — the one lat/lng display format (views and harnesses alike). */
export const formatLatLng = ({ lat, lng }: LatLng): string =>
  `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'W'}`

export const compassArrow = (bearing: number): string =>
  COMPASS_ARROWS[Math.round(bearing / 45) % 8]

// --- Projected map-space boxes -------------------------------------------------

/** An axis-aligned box in the map's projected SVG space: [x, y, width, height]. */
export type MapBox = [number, number, number, number]

/** The world map's design frame (the parsed MAP_VIEWBOX from data/map.gen) —
 *  the one place its 2000×1001 dimensions live outside generated data. */
export const WORLD_BOX: { x: number; y: number; width: number; height: number } = {
  x: 0,
  y: 0,
  width: 2000,
  height: 1001,
}

/**
 * A country's map-space bbox must clear this on at least one axis to carry a
 * written name — below it the label outgrows the country it points at. The
 * map's label builder skips the specks; any dealer that writes names onto the
 * map (errata) must draw from the same set, or it deals a question whose
 * subject never renders.
 */
export const LABELABLE_BOX_UNITS = 14

/** Can this map-space box carry a written label? Narrows, so a caller that
 *  clears the gate can read the box without a second existence check. */
export const isLabelableBox = (box: MapBox | undefined): box is MapBox =>
  !!box && (box[2] >= LABELABLE_BOX_UNITS || box[3] >= LABELABLE_BOX_UNITS)

/**
 * A country's mainland box. The whole-country bbox lies for RU/US-class
 * countries — antimeridian fragments stretch it across the map, putting the
 * US centre closer to Russia than to Canada. MAP_REGIONS emits per-ring boxes
 * sorted largest-first, so the mainland is ring 0; `fallback` (usually
 * MAP_BOUNDS) covers countries with no ring data.
 */
export const mainlandBox = <T extends MapBox | undefined>(
  rings: MapBox[] | undefined,
  fallback: T
): MapBox | T => rings?.[0] ?? fallback

/**
 * The box to hang a written name in the middle of — ALWAYS the mainland ring
 * where there is one, which is a stricter rule than framing uses.
 *
 * A camera can afford the whole-country bbox until it world-fits, so
 * `frameBoxFor` only swaps in the mainland past half the map's width. A label
 * cannot: it is a point, not a window, and any outlying territory drags that
 * point off the country. Russia's bbox is world-spanning and puts "Russia" in
 * the Baltic, but Chile's is merely 281 units wide — nowhere near the framing
 * threshold — and Easter Island still drags its anchor into the open Pacific.
 * Ring 0 is the largest landmass, so its centre is on the country itself.
 */
export const labelBoxFor = (
  bounds: MapBox | undefined,
  rings: MapBox[] | undefined
): MapBox | undefined => mainlandBox(rings, bounds)

// --- Robinson projection ------------------------------------------------------
//
// data/map.gen.ts stores SVG paths already projected through d3's geoRobinson
// at MAP_PROJECTION's scale/translate. Turning a click on that map back into a
// lat/lng needs the inverse. Ported from d3-geo-projection's robinsonRaw so the
// ~1MB projection library stays a build-time devDependency and never reaches
// the client bundle. Verified against d3 to ~1e-13 degrees.

/** d3's Robinson coefficients: [x-scale, y-scale] at 5° steps from -5° to 90°. */
const ROBINSON_K: [number, number][] = [
  [0.9986, -0.062],
  [1.0, 0.0],
  [0.9986, 0.062],
  [0.9954, 0.124],
  [0.99, 0.186],
  [0.9822, 0.248],
  [0.973, 0.31],
  [0.96, 0.372],
  [0.9427, 0.434],
  [0.9216, 0.4958],
  [0.8962, 0.5571],
  [0.8679, 0.6176],
  [0.835, 0.6769],
  [0.7986, 0.7346],
  [0.7597, 0.7903],
  [0.7186, 0.8435],
  [0.6732, 0.8936],
  [0.6213, 0.9394],
  [0.5722, 0.9761],
  [0.5322, 1.0],
].map(([x, y]) => [x, y * 1.593415793900743]) as [number, number][]

/**
 * Robinson forward, in d3's unprojected unit space (`geoRobinson().scale(1)`
 * before its own radians conversion). `lambda`/`phi` are radians.
 */
const robinsonRaw = (lambda: number, phi: number): [number, number] => {
  const i = Math.min(18, (Math.abs(phi) * 36) / Math.PI)
  const i0 = Math.floor(i)
  const di = i - i0

  const [ax, ay] = ROBINSON_K[i0]
  const [bx, by] = ROBINSON_K[i0 + 1]
  const [cx, cy] = ROBINSON_K[Math.min(19, i0 + 2)]

  return [
    lambda * (bx + (di * (cx - ax)) / 2 + ((di * di) / 2) * (cx - 2 * bx + ax)),
    Math.sign(phi) * (by + (di * (cy - ay)) / 2 + ((di * di) / 2) * (cy - 2 * by + ay)),
  ]
}

export interface MapProjection {
  scale: number
  translate: [number, number]
}

/** Project lat/lng into the map's SVG viewBox coordinates. */
export const projectRobinson = (
  { lat, lng }: LatLng,
  projection: MapProjection
): { x: number; y: number } => {
  const [unitX, unitY] = robinsonRaw((lng * Math.PI) / 180, (lat * Math.PI) / 180)
  const [translateX, translateY] = projection.translate
  return {
    x: translateX + unitX * projection.scale,
    y: translateY - unitY * projection.scale,
  }
}

/**
 * Invert a point in the map's SVG viewBox coordinates back to lat/lng.
 *
 * Robinson has no closed form, so latitude is bisected against the forward
 * function (y depends on latitude alone); longitude then falls out directly,
 * since x is linear in it once the latitude's x-coefficient is known.
 *
 * Returns undefined for points outside the projection's silhouette — the
 * corners of the viewBox are not on the globe.
 */
export const invertRobinson = (
  x: number,
  y: number,
  projection: MapProjection
): LatLng | undefined => {
  const [translateX, translateY] = projection.translate
  const unitX = (x - translateX) / projection.scale
  // SVG y grows downward; the projection's does not.
  const unitY = (translateY - y) / projection.scale

  let low = -Math.PI / 2
  let high = Math.PI / 2
  for (let iteration = 0; iteration < 64; iteration++) {
    const mid = (low + high) / 2
    if (robinsonRaw(0, mid)[1] < unitY) low = mid
    else high = mid
  }
  const phi = (low + high) / 2

  // Recover the x-coefficient at this latitude, then divide out.
  const unitAtOneRadian = robinsonRaw(1, phi)[0]
  if (!unitAtOneRadian) return undefined
  const lambda = unitX / unitAtOneRadian

  const lat = (phi * 180) / Math.PI
  const lng = (lambda * 180) / Math.PI
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined
  return { lat, lng }
}
