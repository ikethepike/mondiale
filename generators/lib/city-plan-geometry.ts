/**
 * The pure half of the city-plan extractor (issue #165): projection into a
 * tile's square frame, line simplification, the water-crossing test that
 * decides which bridges the round withholds, and the coverage score a thin
 * tile fails on. Lives in generators/lib so the test runner covers it — the
 * vendor module beside it runs its whole fetch at import.
 */
import { CITY_TILE_HEIGHT, CITY_TILE_SPAN } from '../../lib/ground-plan'

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
const OVERSHOOT = CITY_TILE_HEIGHT / 5

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
  // One scale for both axes — ground must stay square on screen, whatever the
  // cut's own proportions. The cut is authored at the frame's aspect, so the
  // centring below is a rounding allowance rather than a real letterbox.
  const scale = Math.min(CITY_TILE_SPAN / spanX, CITY_TILE_HEIGHT / spanY)
  const offsetX = (CITY_TILE_SPAN - spanX * scale) / 2
  const offsetY = (CITY_TILE_HEIGHT - spanY * scale) / 2

  return ({ lat, lon }) => [
    offsetX + (lon - west) * convergence * scale,
    CITY_TILE_HEIGHT - offsetY - (lat - south) * scale,
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

/**
 * Walk fragments end to end into the longest chains they form, reversing any
 * that run backwards.
 *
 * Both of the pull's assembled layers need this and neither can skip it:
 * Overpass `out geom` does not assemble multipolygons, so the Thames arrives as
 * one relation whose outer boundary is 31 separate ways in arbitrary order and
 * direction, and a tidal coastline arrives as a chain of fragments (16 for
 * Lower Manhattan). Treating either as a set of independent lines draws a river
 * as loose strokes and leaves a shore that cannot be filled.
 *
 * Generic over the point type so the geo-space and tile-space callers share one
 * implementation rather than keeping two copies in step.
 */
export const stitchChains = <T>(
  fragments: readonly T[][],
  meets: (a: T, b: T) => boolean
): T[][] => {
  const pending = fragments.filter(fragment => fragment.length > 1).map(fragment => [...fragment])
  const chains: T[][] = []

  while (pending.length) {
    const chain = pending.shift()!
    let joined = true
    while (joined && !meets(chain[0], chain.at(-1)!)) {
      joined = false
      for (let i = 0; i < pending.length; i++) {
        const candidate = pending[i]
        const tail = chain.at(-1)!
        if (meets(tail, candidate[0])) chain.push(...candidate.slice(1))
        else if (meets(tail, candidate.at(-1)!)) chain.push(...candidate.slice(0, -1).reverse())
        else if (meets(chain[0], candidate.at(-1)!)) chain.unshift(...candidate.slice(0, -1))
        else if (meets(chain[0], candidate[0])) chain.unshift(...candidate.slice(1).reverse())
        else continue
        pending.splice(i, 1)
        joined = true
        break
      }
    }
    chains.push(chain)
  }

  return chains
}

/**
 * A coastline test: is this point in the sea?
 *
 * `natural=coastline` ways are directed with LAND ON THE LEFT and do not close
 * — the frame closes them — so the question cannot be answered by point-in-
 * polygon on any single ring, and a 2km cut routinely holds several unrelated
 * shores. It is the WINDING NUMBER of a rightward ray: each crossing counts +1
 * where the coast runs down the frame and -1 where it runs up, and the sign of
 * the total is the side. Measured against every street vertex in three tidal
 * cities — New York, Stockholm, Helsinki — this misplaces 0.2%, 0.5% and 0.0%
 * of them, and what remains is bridges, which really are over water.
 *
 * The sign carries the answer, so the polarity is still calibrated against
 * points known to be land: which way a coast runs through a frame is an
 * accident of the cut, and a rule that assumed one had Helsinki 84% inverted.
 *
 * Ways must arrive UNSTITCHED and in their original direction: stitching
 * reverses fragments to make chains meet, which destroys the left-hand rule.
 */
/** Tolerance for "this point sits on the frame boundary", in tile units. */
const EDGE_EPSILON = 1e-6

const crossingAtX = (a: TilePoint, b: TilePoint, x: number): TilePoint => [
  x,
  a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]),
]

const crossingAtY = (a: TilePoint, b: TilePoint, y: number): TilePoint => [
  a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]),
  y,
]

/**
 * Clip a closed ring to the frame — Sutherland–Hodgman against each edge in
 * turn.
 *
 * This replaces coordinate clamping for water geometry, and the difference is
 * not cosmetic: Mälaren's outer ring runs a hundred kilometres past the frame,
 * and clamping its far side onto a box around the tile mangled the ring badly
 * enough to flip even-odd containment — eastern Mälaren rendered as land. A
 * ring that fully encloses the frame clips to the frame rectangle itself,
 * which is exactly what a tile in the middle of a lake should paint.
 */
export const clipRingToFrame = (
  ring: readonly TilePoint[],
  width: number,
  height: number
): TilePoint[] => {
  const closes =
    Math.hypot(ring[0][0] - ring.at(-1)![0], ring[0][1] - ring.at(-1)![1]) < EDGE_EPSILON
  let output = closes ? ring.slice(0, -1) : [...ring]

  const stages: {
    inside: (point: TilePoint) => boolean
    cross: (a: TilePoint, b: TilePoint) => TilePoint
  }[] = [
    { inside: point => point[0] >= 0, cross: (a, b) => crossingAtX(a, b, 0) },
    { inside: point => point[0] <= width, cross: (a, b) => crossingAtX(a, b, width) },
    { inside: point => point[1] >= 0, cross: (a, b) => crossingAtY(a, b, 0) },
    { inside: point => point[1] <= height, cross: (a, b) => crossingAtY(a, b, height) },
  ]

  for (const { inside, cross } of stages) {
    const input = output
    output = []
    for (let i = 0; i < input.length; i++) {
      const previous = input[(i + input.length - 1) % input.length]
      const current = input[i]
      if (inside(current)) {
        if (!inside(previous)) output.push(cross(previous, current))
        output.push(current)
      } else if (inside(previous)) {
        output.push(cross(previous, current))
      }
    }
    if (!output.length) return []
  }

  return output.length >= 3 ? [...output, output[0]] : []
}

const onFrameEdge = ([x, y]: TilePoint, width: number, height: number): boolean =>
  x <= EDGE_EPSILON || y <= EDGE_EPSILON || x >= width - EDGE_EPSILON || y >= height - EDGE_EPSILON

/**
 * Push a piece's interior endpoint out to the frame edge along its own heading.
 * A coastline chain can genuinely end mid-frame — the next way along the coast
 * had no node in the bbox, so Overpass never returned it — and a sea closure
 * needs both ends on the boundary.
 */
const reachFrameEdge = (piece: TilePoint[], width: number, height: number): TilePoint[] => {
  const reach = (from: TilePoint, towards: TilePoint): TilePoint => {
    const dx = from[0] - towards[0]
    const dy = from[1] - towards[1]
    if (!Math.hypot(dx, dy)) return from
    const steps = [
      dx > 0 ? (width - from[0]) / dx : dx < 0 ? -from[0] / dx : Infinity,
      dy > 0 ? (height - from[1]) / dy : dy < 0 ? -from[1] / dy : Infinity,
    ].filter(step => step > 0 && Number.isFinite(step))
    if (!steps.length) return from
    const step = Math.min(...steps)
    return [from[0] + dx * step, from[1] + dy * step]
  }

  const head = onFrameEdge(piece[0], width, height) ? [] : [reach(piece[0], piece[1])]
  const tail = onFrameEdge(piece.at(-1)!, width, height)
    ? []
    : [reach(piece.at(-1)!, piece.at(-2)!)]
  return [...head, ...piece, ...tail]
}

/**
 * Clip an open, DIRECTED polyline to the frame, splitting it into the pieces
 * that lie inside. Liang–Barsky per segment; order is preserved because for a
 * coastline the direction is the meaning.
 */
export const clipChainToFrame = (
  chain: readonly TilePoint[],
  width: number,
  height: number
): TilePoint[][] => {
  const clipSegment = (a: TilePoint, b: TilePoint): [TilePoint, TilePoint] | undefined => {
    let t0 = 0
    let t1 = 1
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const p = [-dx, dx, -dy, dy]
    const q = [a[0], width - a[0], a[1], height - a[1]]
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return undefined
        continue
      }
      const r = q[i] / p[i]
      if (p[i] < 0) {
        if (r > t1) return undefined
        if (r > t0) t0 = r
      } else {
        if (r < t0) return undefined
        if (r < t1) t1 = r
      }
    }
    return [
      [a[0] + t0 * dx, a[1] + t0 * dy],
      [a[0] + t1 * dx, a[1] + t1 * dy],
    ]
  }

  const pieces: TilePoint[][] = []
  let current: TilePoint[] = []
  const flush = () => {
    if (current.length > 1) pieces.push(current)
    current = []
  }

  for (let i = 1; i < chain.length; i++) {
    const clipped = clipSegment(chain[i - 1], chain[i])
    if (!clipped) {
      flush()
      continue
    }
    const [from, to] = clipped
    if (!current.length) current.push(from)
    current.push(to)
    const exited = Math.hypot(to[0] - chain[i][0], to[1] - chain[i][1]) > EDGE_EPSILON
    if (exited) flush()
  }
  flush()

  return pieces.map(piece => reachFrameEdge(piece, width, height)).filter(piece => piece.length > 1)
}

/**
 * Where a point sits along the frame boundary, walking top → right → bottom →
 * left. The order is load-bearing: sea rings close by walking the boundary in
 * increasing parameter, which keeps the water enclosed (see closeSea).
 */
const perimeterParam = (width: number, height: number, [x, y]: TilePoint): number => {
  const top = Math.abs(y)
  const right = Math.abs(x - width)
  const bottom = Math.abs(y - height)
  const left = Math.abs(x)
  const nearest = Math.min(top, right, bottom, left)
  if (nearest === top) return x
  if (nearest === right) return width + y
  if (nearest === bottom) return width + height + (width - x)
  return 2 * width + height + (height - y)
}

/**
 * Close clipped coastline pieces into sea rings, walking the frame boundary
 * between them.
 *
 * The rule that makes this correct where four previous attempts were not: an
 * exit connects to the NEXT ENTRY ALONG THE BOUNDARY — whichever piece it
 * belongs to — never back to its own start. Closing each chain onto itself is
 * wrong topology the moment the frame holds more than one shore (Lower
 * Manhattan holds three), and every "which side is wet" heuristic built on top
 * of self-closure inherited that error and needed per-city calibration to
 * paper over it.
 *
 * Direction needs no calibration. OSM directs coastline with land to the left
 * in lon/lat; the projection flips y, and under that flip a boundary walk of
 * increasing perimeter parameter encloses the water side. The worked example
 * is pinned in the tests: an east-running coast encloses the frame's south.
 */
export const closeSea = (
  pieces: readonly (readonly TilePoint[])[],
  width: number,
  height: number
): TilePoint[][] => {
  const total = 2 * (width + height)
  const corners: [number, TilePoint][] = [
    [width, [width, 0]],
    [width + height, [width, height]],
    [2 * width + height, [0, height]],
    [total, [0, 0]],
  ]
  const entries = pieces.map((piece, index) => ({
    index,
    param: perimeterParam(width, height, piece[0]),
  }))
  const used = new Set<number>()
  const rings: TilePoint[][] = []

  for (let start = 0; start < pieces.length; start++) {
    if (used.has(start)) continue
    const ring: TilePoint[] = []
    let current = start

    for (let hop = 0; hop <= pieces.length; hop++) {
      used.add(current)
      ring.push(...pieces[current])
      const exit = perimeterParam(width, height, pieces[current].at(-1)!)

      let next: { index: number; param: number } | undefined
      let nextAhead = Infinity
      for (const entry of entries) {
        if (entry.index !== start && used.has(entry.index)) continue
        const ahead = (entry.param - exit + total) % total
        if (ahead < nextAhead) {
          nextAhead = ahead
          next = entry
        }
      }
      if (!next) break

      const passed = corners
        .map(([param, corner]) => ({ ahead: (param - exit + total) % total, corner }))
        .filter(({ ahead }) => ahead > EDGE_EPSILON && ahead < nextAhead)
        .sort((a, b) => a.ahead - b.ahead)
      for (const { corner } of passed) ring.push(corner)

      if (next.index === start) break
      current = next.index
    }

    if (ring.length > 2) {
      ring.push(ring[0])
      rings.push(ring)
    }
  }

  return rings
}

/**
 * Walk fragments end-to-START only — a directed stitch.
 *
 * Coastline direction is semantic (land on the left), so unlike stitchChains a
 * fragment may never be reversed to make ends meet: two fragments meeting
 * head-to-head are a data error, not a joint, and reversing one would put its
 * stretch of water on the wrong side of the world.
 */
export const stitchDirected = <T>(
  fragments: readonly T[][],
  meets: (a: T, b: T) => boolean
): T[][] => {
  const pending = fragments.filter(fragment => fragment.length > 1).map(fragment => [...fragment])
  const chains: T[][] = []

  while (pending.length) {
    const chain = pending.shift()!
    let joined = true
    while (joined && !meets(chain[0], chain.at(-1)!)) {
      joined = false
      for (let i = 0; i < pending.length; i++) {
        const candidate = pending[i]
        if (meets(chain.at(-1)!, candidate[0])) chain.push(...candidate.slice(1))
        else if (meets(candidate.at(-1)!, chain[0])) chain.unshift(...candidate.slice(0, -1))
        else continue
        pending.splice(i, 1)
        joined = true
        break
      }
    }
    chains.push(chain)
  }

  return chains
}

/** One waterbody's rings, kept together so overlap policy can act per body. */
export interface WaterBody {
  outers: TilePoint[][]
  inners: TilePoint[][]
}

/**
 * Drop waterbodies wholly enclosed by a larger one.
 *
 * OSM routinely maps a named bay as its own relation ON TOP of its parent —
 * Riddarfjärden is a water relation and so is Mälaren, which contains it. Both
 * painted into one even-odd path, the two outers cancel and the bay renders as
 * land. The parent carries its islands as inners (Mälaren lists 1,400+), so
 * the enclosed body contributes nothing the parent does not already paint,
 * and keeping it is exactly what dried Riddarfjärden out.
 *
 * Enclosure is judged on the clipped rings by sampled containment, largest
 * body first, so a chain of nested names (sea → bay → inlet) collapses onto
 * the one that actually paints.
 */
export const dropEnclosedBodies = (bodies: readonly WaterBody[]): WaterBody[] => {
  const area = (body: WaterBody) =>
    body.outers.reduce((total, ring) => total + Math.abs(signedArea(ring)), 0)
  const ordered = [...bodies].sort((a, b) => area(b) - area(a))
  const kept: WaterBody[] = []

  for (const body of ordered) {
    const enclosed =
      body.outers.length > 0 &&
      kept.some(larger =>
        body.outers.every(ring => {
          let inside = 0
          let sampled = 0
          for (let i = 0; i < ring.length; i += 5) {
            sampled++
            if (pointInRings(larger.outers, ring[i])) inside++
          }
          return sampled > 0 && inside / sampled >= 0.9
        })
      )
    if (!enclosed) kept.push(body)
  }

  return kept
}

/** Even-odd containment over a set of rings — the same parity the SVG fill
 *  uses, so a validation probe and the paint can never disagree. */
export const pointInRings = (
  rings: readonly (readonly TilePoint[])[],
  [px, py]: TilePoint
): boolean => {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

/** Signed area of a ring; POSITIVE for one that runs clockwise as drawn
 *  (y grows downward) — an island traced land-on-left comes out positive. */
export const signedArea = (ring: readonly TilePoint[]): number => {
  let area = 0
  for (let i = 1; i < ring.length; i++) {
    area += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1]
  }
  return area / 2
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
  const NEARBY = CITY_TILE_HEIGHT / 25

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
