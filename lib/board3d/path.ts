import Alea from 'alea'
import { CatmullRomCurve3, Vector3 } from 'three'
import { weightedPick } from '~~/lib/arrays'
import type { Tile } from '~~/types/game.types'
import { BOARD_SIZE, type HeightSampler } from './terrain'

export interface TileTransform {
  position: Vector3
  tangent: Vector3
}

/** The track shapes a board can draw. Every generator feeds the same spline →
 *  resample pipeline, so everything downstream (discs, markers, shelving,
 *  camera) is archetype-blind and reads only `spacing`/`chords`. */
export type TrackArchetype = 'serpentine' | 'spiral' | 'horseshoe' | 'ridge'

export interface TilePathResult {
  /** One transform per game tile, index-aligned with `game.tiles`. */
  transforms: TileTransform[]
  /** Dense, elevation-smoothed samples along the track for terrain shelving. */
  shelfPoints: Vector3[]
  /** Arc-length distance between adjacent tile centers — the board's SCALE
   *  unit (tile radius, marker size, hop height all derive from it). It is an
   *  average over the whole curve, so it is the wrong number for local
   *  clearance: see `chords`. */
  spacing: number
  /**
   * Straight-line distance from tile i to tile i+1 (last entry repeats the
   * previous, so it is index-aligned with `transforms`).
   *
   * On a curve the CHORD between neighbours is always shorter than the arc
   * length `spacing` averages — measured minima of 0.84–0.94 × spacing across
   * the dealt lengths, tightest through turns. Anything reasoning about the
   * gap between two tiles (marker clearance, above all) must use this, not
   * `spacing`.
   */
  chords: number[]
  /** The shape this board actually drew — the picked archetype, or serpentine
   *  when every attempt at the pick failed the clearance guard. */
  archetype: TrackArchetype
}

export const DENSITY = 4 // shelf samples per tile segment

/** Tile-disc radius as a fraction of `spacing` — lives here (not in
 *  board-builder, which imports this module) because the clearance guard is
 *  defined in disc terms; board-builder re-exports it for its callers. */
export const TILE_RADIUS_RATIO = 0.42

const INNER_FRACTION = 0.78
const INNER_HALF = (BOARD_SIZE * INNER_FRACTION) / 2

/**
 * Non-adjacent passes of the track must keep this fraction of `spacing` apart
 * in XZ. Discs on separate passes would touch at 0.84 × spacing between
 * centres — but disc centres sit only at every DENSITY-th sample, so the
 * dense-sample separation this guard measures is a conservative proxy, and
 * the shipped serpentine's worst measured value is 0.793 × spacing (the
 * 52-tile row-pitch pinch), which renders clean. 0.75 admits every board the
 * game has ever dealt while rejecting genuinely colliding layouts; a HIGHER
 * floor (2.6 disc radii ≈ 1.09) was measured to reject 25–85% of shipped
 * serpentine seeds — the fallback must never be stricter than production.
 */
export const MIN_PASS_CLEARANCE = 0.75

/** Attempts of the drawn archetype (fresh jitter each) before the board falls
 *  back to the serpentine, which passes the guard on every measured seed. */
const PATH_ATTEMPTS = 8

/** Weighted deal of track shapes. The pick is the `:path` stream's FIRST draw,
 *  unconditionally — moving it, or drawing anything before it, would reshuffle
 *  the jitter of every existing board for no reason. */
const ARCHETYPES: readonly (readonly [TrackArchetype, number])[] = [
  ['serpentine', 35],
  ['spiral', 25],
  ['horseshoe', 25],
  ['ridge', 15],
]

/** Control points on the ground plane (y = 0), all near ±INNER_HALF. The
 *  centripetal spline overshoots its control points by ~1.5 units and jitter
 *  adds a few more — the real board extent runs to ~±44, which the terrain's
 *  EDGE_FADE_START = 85 dwarfs. */
type ControlPointGenerator = (prng: () => number, count: number) => Vector3[]

// --- Serpentine: the original boustrophedon --------------------------------

const serpentineControlPoints: ControlPointGenerator = (prng, count) => {
  const tilesPerRow = Math.ceil(Math.sqrt(count * 1.7))
  const rows = Math.max(2, Math.ceil(count / tilesPerRow))

  const innerWidth = BOARD_SIZE * INNER_FRACTION
  const innerDepth = BOARD_SIZE * INNER_FRACTION
  const rowPitch = innerDepth / (rows - 1)

  // 4 control points per row, alternating direction, jittered.
  const controlPoints: Vector3[] = []
  for (let row = 0; row < rows; row++) {
    const z = -innerDepth / 2 + row * rowPitch
    const fractions = [-0.5, -1 / 6, 1 / 6, 0.5]
    const xs = fractions.map(fraction => fraction * innerWidth)
    if (row % 2 === 1) xs.reverse()

    xs.forEach((x, index) => {
      const isEndpoint = index === 0 || index === xs.length - 1
      const jitterX = (prng() - 0.5) * innerWidth * (isEndpoint ? 0.04 : 0.1)
      const jitterZ = (prng() - 0.5) * rowPitch * 0.3
      controlPoints.push(new Vector3(x + jitterX, 0, z + jitterZ))
    })
  }
  return controlPoints
}

// --- Spiral: rim to center, finale in the middle of the board --------------

/** Coil-to-coil distance as a fraction of spacing. */
const SPIRAL_PITCH_RATIO = 1.5

const spiralControlPoints: ControlPointGenerator = (prng, count) => {
  const R = INNER_HALF * 0.92

  // Pitch and spacing are mutually dependent (pitch = ratio × spacing, the
  // spiral's length fills the annulus area at that pitch, spacing = length /
  // (count-1)) — a few fixed-point rounds converge to well under a millitile.
  let spacing = 8
  let pitch = 0
  let rMin = 0
  for (let round = 0; round < 4; round++) {
    pitch = SPIRAL_PITCH_RATIO * spacing
    // The innermost coil must stay wide relative to the pitch or the coil
    // itself trips the clearance guard's along-track exclusion.
    rMin = 1.2 * pitch
    const area = Math.PI * Math.max(R * R - rMin * rMin, 1)
    spacing = Math.sqrt(area / (SPIRAL_PITCH_RATIO * (count - 1)))
  }

  const b = pitch / (2 * Math.PI)
  const thetaMax = (R - rMin) / b
  const theta0 = prng() * 2 * Math.PI
  const winding = prng() < 0.5 ? 1 : -1

  // Equal-arc control points via a numeric arc table — the closed forms
  // drift near the center, where drift matters most.
  const steps = 2000
  const dTheta = thetaMax / steps
  const arcs: number[] = [0]
  for (let i = 1; i <= steps; i++) {
    const r = R - b * (i - 0.5) * dTheta
    arcs.push(arcs[i - 1] + Math.sqrt(r * r + b * b) * dTheta)
  }
  const total = arcs[steps]

  const pointCount = Math.max(10, Math.ceil(count / 2.6))
  const controlPoints: Vector3[] = []
  for (let j = 0; j <= pointCount; j++) {
    const target = (total * j) / pointCount
    let low = 0
    let high = steps
    while (low < high) {
      const mid = (low + high) >> 1
      if (arcs[mid] < target) low = mid + 1
      else high = mid
    }
    const theta = low * dTheta
    const radius = R - b * theta + (prng() - 0.5) * pitch * 0.12
    const angle = theta0 + winding * theta
    controlPoints.push(new Vector3(radius * Math.cos(angle), 0, radius * Math.sin(angle)))
  }
  return controlPoints
}

// --- Horseshoe: nested C-arcs sharing one mouth ----------------------------

/** The mouth's angular gap — the opening all laps share. */
const HORSESHOE_MOUTH_RAD = 1.22

const horseshoeControlPoints: ControlPointGenerator = (prng, count) => {
  const R = INNER_HALF * 0.92
  const rIn = R * 0.4
  // More laps lengthen the curve: this ratio keeps spacing at 40/65/90 tiles
  // at ≈7.1/6.3/6.0 — denser than the serpentine (an amphitheater reads
  // tighter by design) but inside the sized-for band.
  const laps = Math.min(5, Math.max(2, Math.round(count / 22)))
  const pitch = (R - rIn) / (laps - 1)
  const span = 2 * Math.PI - HORSESHOE_MOUTH_RAD
  const mouthStart = prng() * 2 * Math.PI

  const controlPoints: Vector3[] = []
  for (let lap = 0; lap < laps; lap++) {
    const base = R - lap * pitch
    const steps = Math.ceil(span / 0.45)
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      // Alternate sweep direction so consecutive laps join at the same mouth
      // end — the join between two laps is a short radial rung, the polar
      // cousin of the serpentine's row turn.
      const along = lap % 2 === 0 ? t : 1 - t
      const angle = mouthStart + span * along
      const radius = base + (prng() - 0.5) * pitch * 0.1
      controlPoints.push(new Vector3(radius * Math.cos(angle), 0, radius * Math.sin(angle)))
    }
  }
  return controlPoints
}

// --- Ridge: a serpentine tapering to a narrow top --------------------------

/** How much the last row shrinks versus the first. */
const RIDGE_TAPER = 0.5

const ridgeControlPoints: ControlPointGenerator = (prng, count) => {
  const innerWidth = BOARD_SIZE * INNER_FRACTION
  const innerDepth = BOARD_SIZE * INNER_FRACTION
  // Rows shrink toward the top, so the same tile count needs more of them
  // than the square serpentine (mean width factor ≈ 0.75).
  const tilesPerRow = Math.ceil(Math.sqrt(count * 1.7) * 0.87)
  const rows = Math.max(3, Math.ceil(count / tilesPerRow))
  const rowPitch = innerDepth / (rows - 1)
  // Which side the trapezoid leans against: left, centered, or right.
  const side = Math.floor(prng() * 3) - 1

  const controlPoints: Vector3[] = []
  for (let row = 0; row < rows; row++) {
    const width = innerWidth * (1 - (RIDGE_TAPER * row) / (rows - 1))
    const center = (side * (innerWidth - width)) / 2
    const z = -innerDepth / 2 + row * rowPitch
    const fractions = [-0.5, -1 / 6, 1 / 6, 0.5]
    const xs = fractions.map(fraction => center + fraction * width)
    if (row % 2 === 1) xs.reverse()

    xs.forEach((x, index) => {
      const isEndpoint = index === 0 || index === xs.length - 1
      const jitterX = (prng() - 0.5) * width * (isEndpoint ? 0.04 : 0.1)
      const jitterZ = (prng() - 0.5) * rowPitch * 0.3
      controlPoints.push(new Vector3(x + jitterX, 0, z + jitterZ))
    })
  }
  return controlPoints
}

const GENERATORS: Record<TrackArchetype, ControlPointGenerator> = {
  serpentine: serpentineControlPoints,
  spiral: spiralControlPoints,
  horseshoe: horseshoeControlPoints,
  ridge: ridgeControlPoints,
}

/**
 * Every pair of dense samples that is not near-neighbouring ALONG the track
 * (index gap > 2 tiles) must keep `MIN_PASS_CLEARANCE × spacing` apart in XZ —
 * the guard that keeps one pass's discs off another's. Uniform-grid broadphase
 * (the `withPathShelf` trick): each sample checks only its 3×3 neighbourhood.
 */
export const trackIsClear = (densePoints: Vector3[], spacing: number): boolean => {
  const minSeparation = MIN_PASS_CLEARANCE * spacing
  const minSquared = minSeparation * minSeparation
  const cell = minSeparation
  const grid = new Map<string, number[]>()

  densePoints.forEach((point, index) => {
    const key = `${Math.floor(point.x / cell)}:${Math.floor(point.z / cell)}`
    const bucket = grid.get(key)
    if (bucket) bucket.push(index)
    else grid.set(key, [index])
  })

  for (let index = 0; index < densePoints.length; index++) {
    const point = densePoints[index]
    const cellX = Math.floor(point.x / cell)
    const cellZ = Math.floor(point.z / cell)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = grid.get(`${cellX + dx}:${cellZ + dz}`)
        if (!bucket) continue
        for (const other of bucket) {
          if (other - index <= 2 * DENSITY) continue // symmetric: visit i<j once
          const otherPoint = densePoints[other]
          const distX = point.x - otherPoint.x
          const distZ = point.z - otherPoint.z
          if (distX * distX + distZ * distZ < minSquared) return false
        }
      }
    }
  }
  return true
}

/** The planar spline stage, shared by every attempt: control points →
 *  centripetal Catmull-Rom → equidistant dense samples. */
const layTrack = (controlPoints: Vector3[], count: number) => {
  const curve = new CatmullRomCurve3(controlPoints, false, 'centripetal')
  const denseCount = DENSITY * (count - 1) + 1
  const densePoints = curve.getSpacedPoints(denseCount - 1)
  const spacing = curve.getLength() / (count - 1)
  return { densePoints, denseCount, spacing }
}

/**
 * Lay the game tiles along a seeded track archetype: a weighted per-seed pick
 * of track shape → jittered control points → centripetal Catmull-Rom spline →
 * N equidistant arc-length samples. A drawn shape gets `PATH_ATTEMPTS` tries
 * of fresh jitter to pass the clearance guard, then the board falls back to
 * the serpentine. Same seed → identical path on every client; a deploy that
 * changes this module reshapes live boards mid-game, which is cosmetic-only
 * (pawn positions are tile indices) and has shipped before with jitter tweaks.
 *
 * `options.archetype` (tests/workbenches) forces the drawn shape — the guard
 * and fallback still apply, and the RESULT's `archetype` reports what held.
 */
export const createTilePath = (
  seed: string,
  tiles: Tile[],
  sampler: HeightSampler,
  options?: { archetype?: TrackArchetype }
): TilePathResult => {
  const prng = Alea(`${seed}:path`)
  const count = tiles.length

  // FIRST draw, unconditionally — see ARCHETYPES.
  const drawn = weightedPick(ARCHETYPES, prng) ?? 'serpentine'
  const picked = options?.archetype ?? drawn

  let archetype: TrackArchetype = picked
  let laid = layTrack(GENERATORS[picked](prng, count), count)
  for (let attempt = 0; attempt < PATH_ATTEMPTS - 1; attempt++) {
    if (trackIsClear(laid.densePoints, laid.spacing)) break
    laid = layTrack(GENERATORS[picked](prng, count), count)
  }
  if (!trackIsClear(laid.densePoints, laid.spacing) && picked !== 'serpentine') {
    archetype = 'serpentine'
    laid = layTrack(serpentineControlPoints(prng, count), count)
  }
  const { densePoints, denseCount, spacing } = laid

  // Elevate along the raw terrain, then smooth so the track never staircases.
  const rawElevations = densePoints.map(point => sampler(point.x, point.z))
  const window = 9
  const smoothed = rawElevations.map((_, index) => {
    let sum = 0
    let samples = 0
    for (let offset = -window; offset <= window; offset++) {
      const at = index + offset
      if (at < 0 || at >= denseCount) continue
      sum += rawElevations[at]
      samples++
    }
    return sum / samples
  })

  const shelfPoints = densePoints.map(
    (point, index) => new Vector3(point.x, smoothed[index], point.z)
  )

  const transforms: TileTransform[] = tiles.map((_, index) => {
    const dense = index * DENSITY
    const previous = shelfPoints[Math.max(0, dense - 1)]
    const next = shelfPoints[Math.min(denseCount - 1, dense + 1)]
    const tangent = new Vector3().subVectors(next, previous).setY(0).normalize()

    return {
      position: shelfPoints[dense].clone(),
      tangent,
    }
  })

  // Measured from the tile centres themselves, so it already carries the
  // elevation smoothing and the jitter — nothing to keep in sync.
  const chords = transforms.map((transform, index) =>
    index < count - 1 ? transform.position.distanceTo(transforms[index + 1].position) : 0
  )
  if (count > 1) chords[count - 1] = chords[count - 2]

  return { transforms, shelfPoints, spacing, chords, archetype }
}
