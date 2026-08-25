/**
 * The pure half of the city-plan extractor (issue #165): projection into a
 * tile's square frame, line simplification, the water-crossing test that
 * decides which bridges the round withholds, and the coverage score a thin
 * tile fails on. Lives in generators/lib so the test runner covers it — the
 * vendor module beside it runs its whole fetch at import.
 */
import { CITY_TILE_SPAN } from '../../lib/ground-plan'

/** A point in tile space: [x, y] inside a CITY_TILE_SPAN square. */
export type TilePoint = [number, number]

/** A point as Overpass returns it. */
export interface GeoPoint {
  lat: number
  lon: number
}

/** [south, west, north, east] — the cut, as a roster entry carries it. */
export type BoundingBox = [number, number, number, number]

/**
 * Douglas-Peucker tolerance in tile units. At a ~2km cut one unit is about two
 * metres, so this drops detail no player can see at any sane display size.
 */
export const SIMPLIFY_TOLERANCE = 3

/**
 * Fabric shorter than this is dropped: a driveway-length residential stub
 * reads as noise rather than grain, and the fabric layer is most of the tile's
 * weight.
 */
export const MINIMUM_FABRIC_LENGTH = 12

/** Decimals kept on emitted coordinates. Whole units at ~2m each. */
const COORDINATE_DECIMALS = 0

/**
 * How far outside the frame a clipped coordinate may sit. Geometry is kept
 * whole rather than truly clipped — a way leaving and re-entering the frame
 * stays one line — but a way running to the next city would otherwise carry
 * thousands of unseen units into the payload.
 */
const OVERSHOOT = CITY_TILE_SPAN / 5

/**
 * Project lat/lng into the tile's square frame. A local equirectangular scaled
 * by cos(latitude): across a few kilometres the shear is far below one pixel,
 * and unlike the map's Robinson it needs no fitting. The shorter axis is
 * centred, so a cut that is not square sits in the middle of its frame.
 *
 * Tiles ship pre-projected for the same reason water features do — nothing at
 * runtime should have to reproduce this.
 */
export const tileProjection = (box: BoundingBox): ((point: GeoPoint) => TilePoint) => {
  const [south, west, north, east] = box
  const convergence = Math.cos(((south + north) / 2) * (Math.PI / 180))
  const spanX = (east - west) * convergence
  const spanY = north - south
  const scale = CITY_TILE_SPAN / Math.max(spanX, spanY)
  const offsetX = (CITY_TILE_SPAN - spanX * scale) / 2
  const offsetY = (CITY_TILE_SPAN - spanY * scale) / 2

  return ({ lat, lon }) => [
    offsetX + (lon - west) * convergence * scale,
    CITY_TILE_SPAN - offsetY - (lat - south) * scale,
  ]
}

const perpendicularDistance = (point: TilePoint, start: TilePoint, end: TilePoint): number => {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared) return Math.hypot(point[0] - start[0], point[1] - start[1])
  const along = Math.max(
    0,
    Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared)
  )
  return Math.hypot(point[0] - (start[0] + along * dx), point[1] - (start[1] + along * dy))
}

/**
 * The point count above which a way is split before simplifying.
 *
 * Douglas-Peucker rescans its whole range at each split, so its cost depends on
 * how much it can DISCARD: a 60k-point coastline simplifies in 10ms because
 * most points go, but a way where every point must be kept degrades to O(n²)
 * and measured 20 seconds at the same size. Chunking bounds that worst case at
 * a barely-visible cost — one extra retained vertex per chunk boundary.
 */
const SIMPLIFY_CHUNK = 4096

/**
 * Douglas-Peucker, with a radial-distance pre-pass and a chunk cap.
 *
 * Iterative rather than recursive: a deep split stack overflows on real
 * geometry.
 */
export const simplifyLine = (points: TilePoint[], tolerance: number): TilePoint[] => {
  if (points.length < 3) return points

  // Chunks OVERLAP by one point so the joins carry no gap. The slice must stay
  // strictly shorter than the cap or this branch re-enters on its own chunk
  // forever, which the long-way test catches as a stack overflow.
  if (points.length > SIMPLIFY_CHUNK + 1) {
    const simplified: TilePoint[] = []
    for (let start = 0; start < points.length - 1; start += SIMPLIFY_CHUNK) {
      const chunk = points.slice(start, Math.min(points.length, start + SIMPLIFY_CHUNK + 1))
      const done = simplifyLine(chunk, tolerance)
      // A spread would push every retained point as a call argument and blow
      // the stack on a long way — the very case this branch exists for.
      for (let i = start === 0 ? 0 : 1; i < done.length; i++) simplified.push(done[i])
    }
    return simplified
  }

  const coarse: TilePoint[] = [points[0]]
  const minimumStep = tolerance * tolerance
  for (let i = 1; i < points.length - 1; i++) {
    const previous = coarse.at(-1)!
    const dx = points[i][0] - previous[0]
    const dy = points[i][1] - previous[1]
    if (dx * dx + dy * dy >= minimumStep) coarse.push(points[i])
  }
  coarse.push(points.at(-1)!)
  if (coarse.length < 3) return coarse

  const keep = new Uint8Array(coarse.length)
  keep[0] = 1
  keep[coarse.length - 1] = 1
  const stack: [number, number][] = [[0, coarse.length - 1]]

  while (stack.length) {
    const [start, end] = stack.pop()!
    let furthest = 0
    let index = start
    for (let i = start + 1; i < end; i++) {
      const distance = perpendicularDistance(coarse[i], coarse[start], coarse[end])
      if (distance > furthest) {
        furthest = distance
        index = i
      }
    }
    if (furthest <= tolerance) continue
    keep[index] = 1
    stack.push([start, index], [index, end])
  }

  return coarse.filter((_, index) => keep[index])
}

/** Total length of a polyline in tile units. */
export const lineLength = (points: readonly TilePoint[]): number => {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  }
  return total
}

/** Whether a line's ends meet — an area ring rather than an open way. */
export const isRing = (points: readonly TilePoint[]): boolean =>
  points.length > 3 &&
  Math.hypot(points[0][0] - points.at(-1)![0], points[0][1] - points.at(-1)![1]) < 1

const straddles = (a: TilePoint, b: TilePoint, c: TilePoint, d: TilePoint): boolean => {
  const side = (p: TilePoint, q: TilePoint, r: TilePoint) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  return side(a, b, c) > 0 !== side(a, b, d) > 0 && side(c, d, a) > 0 !== side(c, d, b) > 0
}

/**
 * Whether a way actually crosses water — the test that decides what the bridge
 * layer withholds.
 *
 * Tagging alone is not enough and the difference is not marginal: a 2km cut of
 * central London carries 171 `bridge=yes` ways and only 16 of them cross the
 * Thames. The other 155 are ordinary overpasses, and withholding those would
 * punch holes through the road network across the whole frame.
 */
export const crossesWater = (
  line: readonly TilePoint[],
  water: readonly (readonly TilePoint[])[]
): boolean => {
  for (let i = 1; i < line.length; i++) {
    for (const feature of water) {
      for (let j = 1; j < feature.length; j++) {
        if (straddles(line[i - 1], line[i], feature[j - 1], feature[j])) return true
      }
    }
  }
  return false
}

/** How far a drawn bridge reaches past the bank it lands on, in tile units. */
export const BRIDGE_OVERHANG = 14

/** Half-length of the deck laid over a water feature with no banks to span. */
const MINIMUM_DECK = 6

/** Where two segments cross, as a fraction along the first. */
const crossingAt = (a: TilePoint, b: TilePoint, c: TilePoint, d: TilePoint): number | undefined => {
  const denominator = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
  if (!denominator) return undefined
  const along = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / denominator
  const across = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / denominator
  if (along < 0 || along > 1 || across < 0 || across > 1) return undefined
  return along
}

/**
 * The part of a bridge that is actually over water, cut at the banks.
 *
 * Clipping at the crossing POINTS rather than at existing vertices is the
 * whole point: simplification leaves most bridge ways as two points, so there
 * is no interior vertex to slice at, and a rail bridge kept whole lands as a
 * slab running the length of the frame instead of a span across the river.
 *
 * `overhang` pads the deck past each bank so it visibly lands on both sides.
 * It defaults to none, because the crossing COUNT must be taken from unpadded
 * spans: padding two nearby bridges until they touch would merge them into one
 * and understate the city.
 */
export const waterSpan = (
  line: readonly TilePoint[],
  water: readonly (readonly TilePoint[])[],
  overhangUnits = 0
): TilePoint[] => {
  const hits: TilePoint[] = []

  for (let i = 1; i < line.length; i++) {
    const start = line[i - 1]
    const end = line[i]
    const fractions: number[] = []
    for (const feature of water) {
      for (let j = 1; j < feature.length; j++) {
        const at = crossingAt(start, end, feature[j - 1], feature[j])
        if (at !== undefined) fractions.push(at)
      }
    }
    if (!fractions.length) continue
    // Only the outermost crossings matter — the far banks, not each ripple of
    // an inlet the way happens to clip on its run in.
    for (const at of [Math.min(...fractions), Math.max(...fractions)]) {
      hits.push([start[0] + (end[0] - start[0]) * at, start[1] + (end[1] - start[1]) * at])
    }
  }

  if (!hits.length) return [...line]

  const first = hits[0]
  const last = hits.at(-1)!
  let dx = last[0] - first[0]
  let dy = last[1] - first[1]
  let reach = Math.hypot(dx, dy)

  // A bank-less water feature (a canal centreline, a narrow river) is crossed
  // exactly once, so there is no span between banks to measure. Take the way's
  // own heading and lay a minimum deck across the point where it meets the
  // water — a zero-length span would be an invisible bridge.
  if (reach < 1) {
    const heading = line.at(-1)!
    dx = heading[0] - line[0][0]
    dy = heading[1] - line[0][1]
    reach = Math.hypot(dx, dy)
    if (!reach) return [...line]
    const deck = Math.max(overhangUnits, MINIMUM_DECK) / reach
    return [
      [first[0] - dx * deck, first[1] - dy * deck],
      [last[0] + dx * deck, last[1] + dy * deck],
    ]
  }

  const overhang = overhangUnits / reach
  return [
    [first[0] - dx * overhang, first[1] - dy * overhang],
    [last[0] + dx * overhang, last[1] + dy * overhang],
  ]
}

/**
 * Distinct crossings, not ways — what the reveal's bridge count states.
 *
 * One span is routinely several ways: a carriageway each direction, a footway
 * alongside, and OSM often splits a single bridge into segments that run
 * opposite ways. Counting ways overstates every city — Manhattan's two
 * Brooklyn Bridge ways are one crossing, not two.
 *
 * Spans are one crossing when they share ground anywhere along their length,
 * not merely at their midpoints: two halves of one bridge have midpoints far
 * apart but overlap end to end.
 */
export const countCrossings = (spans: readonly (readonly TilePoint[])[]): number => {
  const NEARBY = CITY_TILE_SPAN / 25

  const near = (a: readonly TilePoint[], b: readonly TilePoint[]): boolean =>
    a.some(([ax, ay]) => b.some(([bx, by]) => Math.hypot(ax - bx, ay - by) < NEARBY))

  const groups: (readonly TilePoint[])[][] = []
  for (const span of spans) {
    const joined = groups.find(group => group.some(member => near(member, span)))
    if (joined) joined.push(span)
    else groups.push([span])
  }
  return groups.length
}

const round = (value: number): number => Number(value.toFixed(COORDINATE_DECIMALS))

const clamp = (value: number): number =>
  Math.max(-OVERSHOOT, Math.min(CITY_TILE_SPAN + OVERSHOOT, round(value)))

/**
 * One layer's lines as an SVG path: absolute move, then a single relative line
 * command per subpath, matching the map tiers' encoding. Pure move/line/close
 * commands only, so `parsePolygons` can read the result back.
 */
export const emitPath = (lines: readonly (readonly TilePoint[])[], close = false): string => {
  const subpaths: string[] = []

  for (const line of lines) {
    const rounded: TilePoint[] = []
    for (const [x, y] of line) {
      const point: TilePoint = [clamp(x), clamp(y)]
      const previous = rounded.at(-1)
      if (previous && previous[0] === point[0] && previous[1] === point[1]) continue
      rounded.push(point)
    }
    if (rounded.length < 2) continue

    const deltas: string[] = []
    for (let i = 1; i < rounded.length; i++) {
      deltas.push(
        `${round(rounded[i][0] - rounded[i - 1][0])},${round(rounded[i][1] - rounded[i - 1][1])}`
      )
    }
    subpaths.push(`M ${rounded[0][0]},${rounded[0][1]} l ${deltas.join(' ')}${close ? ' z' : ''}`)
  }

  return subpaths.join(' ')
}

/** Vertices an emitted path carries — the size report's unit. */
export const countVertices = (lines: readonly (readonly TilePoint[])[]): number =>
  lines.reduce((total, line) => total + line.length, 0)

const EARTH_RADIUS_KM = 6371

/** Great-circle distance in km — the coverage score's unit. */
export const haversineKm = (a: GeoPoint, b: GeoPoint): number => {
  const toRadians = (degrees: number) => degrees * (Math.PI / 180)
  const deltaLat = toRadians(b.lat - a.lat)
  const deltaLon = toRadians(b.lon - a.lon)
  const chord =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(deltaLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(chord))
}

/** A cut's area in km², from its own corners. */
export const boxAreaKm2 = (box: BoundingBox): number => {
  const [south, west, north, east] = box
  const width = haversineKm(
    { lat: (south + north) / 2, lon: west },
    { lat: (south + north) / 2, lon: east }
  )
  const height = haversineKm({ lat: south, lon: west }, { lat: north, lon: west })
  return width * height
}

/**
 * Street kilometres per km². Measured on three real cuts: London 24, Fez 26,
 * Lower Manhattan 32. A tile far below that range is one nobody has mapped,
 * which is not a question about a city — the roster fails it rather than
 * dealing an unfairly empty frame.
 */
export const MINIMUM_STREET_DENSITY = 8

export const streetDensity = (streetKm: number, box: BoundingBox): number =>
  streetKm / boxAreaKm2(box)
