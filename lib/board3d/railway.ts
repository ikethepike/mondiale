import Alea from 'alea'
import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import { prefersReducedMotion } from '~~/lib/motion'
import { clamp, clamp01 } from '~~/lib/number'
import type { BoardBiome } from './biomes'
import { BOARD_COLORS } from './colors'
import { type LakeSite, lakeShoreDistance } from './lake'
import {
  lineCrossesItself,
  loopCrossesItself,
  polylinesIntersect,
  segmentsIntersect,
  smoothPolyline,
} from './polyline'
import { makeSmokePuffs } from './smoke'
import type { TownSite } from './town'
import type { TilePathResult } from './path'
import type { RiverPath } from './river'
import type { ScenerySites, WaymarkSite } from './scenery'
import type { SummitSite } from './summit'
import { EDGE_FADE_START, MAX_ELEVATION, type HeightSampler } from './terrain'
import type { PondSite } from './water'

/**
 * A decorative railway for certain seeds: a contour line made literal. A
 * seeded probe marches a level set of the finished terrain until it comes
 * home, Laplacian cut-and-fill irons the wiggles into a graded line, and an
 * old steam train rounds the closed circuit forever. Proven in the
 * /test-terrain lab; purely visual, always the feature that yields — picked
 * after track, pond, massif, river and scenery, never constraining them.
 */

/** Under a third of boards even survey for a line, and siting succeeds on
 *  only ~a quarter of attempts (fat clear contours are scarce once track,
 *  water and massif have claimed their ground) — a dealt railway is a
 *  once-in-a-dozen-boards event, special on purpose. */
const RAILWAY_CHANCE = 0.3
/** The grade band a line may be built in (fractions of MAX_ELEVATION). */
const GRADE_MIN = MAX_ELEVATION * 0.32
const GRADE_MAX = MAX_ELEVATION * 0.66
/** Contour-march stride (world units) and budgets. */
const MARCH_STEP = 2.5
const MARCH_STEPS = 280
const PROBES = 200
/** Closure: home within this after a minimum lap. */
const CLOSE_DISTANCE = 3.2
const MIN_LOOP_POINTS = 22
/** Fatness: enclosed area floor, and opposite passes never crowd closer. */
const MIN_LOOP_AREA = 350
const CROWD_DISTANCE = 3.2
/** How far the line keeps from every track sample (×spacing) — outside the
 *  shelf band and any marker overhang, same berth the scenery keeps. */
const TRACK_CLEARANCE = 1.6
/** The train's pace, world units per second — an easy chug. */
const TRAIN_SPEED = 2.1
/** Rolling-stock spacing along the loop (world units, buffer to buffer). */
const VEHICLE_GAP = 2.4
/** Where reduced motion parks the train as a scene prop. */
const PARKED_T = 0.45
/** Traverse: stride and budgets for the valley-seeking open march. */
const TRAVERSE_STEP = 2.5
const TRAVERSE_MAX_STEPS = 110
const TRAVERSE_PROBES = 60
/** The line runs off the sheet: ends push this far past the fade start. */
const TRAVERSE_EXIT = EDGE_FADE_START + 6
/** An open line shorter than this reads as a fragment — decline. */
const TRAVERSE_MIN_LENGTH = 80
/** The two-tier track rule: the aesthetic berth (TRACK_CLEARANCE) holds in
 *  open country, but a traverse may thread a corridor BETWEEN two passes
 *  down to this hard floor (×spacing) — never onto the ribbon itself. */
const CORRIDOR_FLOOR = 0.8
/** A sub-berth stand is only a corridor when track flanks it on BOTH sides
 *  within this reach (×spacing) — otherwise it is just hugging one pass. */
const CORRIDOR_NEAR = 2.0
/** Corridor threading keeps this reach (×spacing) from every TILE center —
 *  markers overhang their tiles, and the berth exists because of them. */
const CORRIDOR_TILE_CLEARANCE = 1.2
/** Per-stride terrain rise the march accepts before deflecting to contour. */
const TRAVERSE_MAX_RISE = 0.45
/** Rails may float this far above a dip before the route is refused — the
 *  gap below becomes trestlework. */
const TRAVERSE_MAX_FLOAT = 1.1
/** Trestle posts rise wherever the graded line floats above this gap. */
const TRESTLE_MIN_GAP = 0.4
/** Vehicles fade over this leading/trailing fraction of an open line — the
 *  train leaves the map the way a railway leaves the sheet. */
const TRAVERSE_FADE = 0.06
/** River bridging: the march may APPROACH the water this obliquely (|cos|
 *  of rail direction vs river tangent) — the span itself then snaps to the
 *  river's exact perpendicular, the way a line turns to take its viaduct
 *  square. Rails and rivers both follow valleys, so square approaches
 *  almost never happen on their own. */
const BRIDGE_DOT_MAX = 0.75
const BRIDGE_MAX_SPAN = 14
const BRIDGE_STRIDE = 1.25
const MAX_BRIDGES = 2
/** Over a bridged span the rails may float higher than over a dry dip —
 *  the carved bed below is what the trestles stand in. */
const BRIDGE_FLOAT_CAP = 2.4

export interface RailwayRoute {
  points: Vector3[]
  /** Closed contour loop, or an edge-to-edge traverse off the sheet. */
  closed: boolean
  /** Trestle viaducts where a traverse takes the river (empty for loops). */
  bridges: { center: Vector3; halfLength: number }[]
}

export interface RailwayBuild {
  meshes: (Mesh | InstancedMesh | Group)[]
  /** Advance the train; TopoScene's landscape ticker calls this each frame. */
  drive: (time: number) => void
}

/** Everything a rail line yields to, besides the track itself. ONE list for
 *  both route kinds — the loop treats 'river' as blocked, the traverse
 *  bridges it. Cheap single-hypot checks; the caller runs its own (more
 *  expensive) track-clearance test after this returns undefined. */
interface RailObstacles {
  pond?: PondSite
  summit?: SummitSite
  river?: RiverPath
  scenery: ScenerySites
  lake?: LakeSite
  town?: TownSite
  waymarks?: WaymarkSite[]
  spacing: number
}

const railObstacleAt = (
  features: RailObstacles
): ((x: number, z: number) => 'hard' | 'river' | undefined) => {
  const { pond, summit, river, scenery, lake, town, waymarks, spacing } = features
  return (x, z) => {
    if (pond && Math.hypot(pond.center.x - x, pond.center.z - z) < pond.basinRadius + 3)
      return 'hard'
    // ×1.05 matches the summit site's own clearance convention — shoulder
    // peaks are sized against exactly that reach, so the line can never ride
    // up a shoulder's foot.
    if (
      summit &&
      Math.hypot(summit.center.x - x, summit.center.z - z) < summit.radius + spacing * 1.05
    )
      return 'hard'
    if (town && Math.hypot(town.center.x - x, town.center.z - z) < town.radius + 2.5)
      return 'hard'
    for (const cairn of scenery.cairns) {
      if (Math.hypot(cairn.x - x, cairn.z - z) < 5) return 'hard'
    }
    if (scenery.compass) {
      const compass = scenery.compass
      if (Math.hypot(compass.x - x, compass.z - z) < spacing * 3) return 'hard'
    }
    if (scenery.stones) {
      const stones = scenery.stones.center
      if (Math.hypot(stones.x - x, stones.z - z) < spacing * 1.5) return 'hard'
    }
    if (scenery.scaleBar) {
      const scaleBar = scenery.scaleBar.center
      if (Math.hypot(scaleBar.x - x, scaleBar.z - z) < 4) return 'hard'
    }
    if (scenery.basecamp) {
      const basecamp = scenery.basecamp.center
      if (Math.hypot(basecamp.x - x, basecamp.z - z) < 4) return 'hard'
    }
    // Fingerposts stand INSIDE the loop's berth (harmless there), but the
    // traverse's corridor floor reaches past them — the railway must know.
    if (waymarks) {
      for (const mark of waymarks) {
        if (Math.hypot(mark.position.x - x, mark.position.z - z) < 2) return 'hard'
      }
    }
    if (lake && lakeShoreDistance(lake, x, z) < 2.5) return 'hard'
    if (river) {
      const gap = river.width + 2.5
      for (const point of river.points) {
        if (Math.hypot(point.x - x, point.z - z) < gap) return 'river'
      }
    }
    return undefined
  }
}

/**
 * Survey for a closed contour loop clear of everything the board already
 * placed. Returns the smoothed ground-hugging loop, or undefined — a board
 * without a viable circuit simply goes without.
 */
export const pickRailwayLoop = (
  seed: string,
  path: TilePathResult,
  pond: PondSite | undefined,
  summit: SummitSite | undefined,
  river: RiverPath | undefined,
  scenery: ScenerySites,
  sampler: HeightSampler,
  lake?: LakeSite,
  town?: TownSite,
  waymarks?: WaymarkSite[]
): Vector3[] | undefined => {
  const random = Alea(`${seed}:railway`)
  if (random() > RAILWAY_CHANCE) return undefined

  const { shelfPoints, spacing } = path
  const clearance = TRACK_CLEARANCE * spacing
  const clearanceSquared = clearance * clearance
  const obstacleAt = railObstacleAt({
    pond,
    summit,
    river,
    scenery,
    lake,
    town,
    waymarks,
    spacing,
  })

  const clearForRail = (x: number, z: number): boolean => {
    if (Math.hypot(x, z) > EDGE_FADE_START - 4) return false
    for (const point of shelfPoints) {
      const dx = point.x - x
      const dz = point.z - z
      if (dx * dx + dz * dz < clearanceSquared) return false
    }
    // The loop never bridges: any obstacle, the river included, turns it.
    return obstacleAt(x, z) === undefined
  }

  for (let probe = 0; probe < PROBES; probe++) {
    const startX = (random() - 0.5) * 2 * (EDGE_FADE_START - 8)
    const startZ = (random() - 0.5) * 2 * (EDGE_FADE_START - 8)
    const gradeY = sampler(startX, startZ)
    if (gradeY < GRADE_MIN || gradeY > GRADE_MAX) continue
    if (!clearForRail(startX, startZ)) continue

    // March one way around the level set — a contour is closed by nature, so
    // with luck it comes home. A march that runs off the page, into water or
    // out of budget yields to the next probe.
    const points: Vector3[] = [new Vector3(startX, 0, startZ)]
    let px = startX
    let pz = startZ
    let headingX = 0
    let headingZ = 0
    let closed = false
    for (let step = 0; step < MARCH_STEPS; step++) {
      const gradientX = (sampler(px + 1, pz) - sampler(px - 1, pz)) / 2
      const gradientZ = (sampler(px, pz + 1) - sampler(px, pz - 1)) / 2
      let dx = -gradientZ
      let dz = gradientX
      const magnitude = Math.hypot(dx, dz) || 1
      dx /= magnitude
      dz /= magnitude
      if (step > 0 && dx * headingX + dz * headingZ < 0) {
        dx = -dx
        dz = -dz
      }
      headingX = dx
      headingZ = dz
      // Walk the contour, nudging back onto the grade line.
      const drift = sampler(px, pz) - gradeY
      px += dx * MARCH_STEP - gradientX * drift * 1.5
      pz += dz * MARCH_STEP - gradientZ * drift * 1.5
      if (!clearForRail(px, pz)) break
      points.push(new Vector3(px, 0, pz))
      if (step > 20 && Math.hypot(px - startX, pz - startZ) < CLOSE_DISTANCE) {
        closed = true
        break
      }
    }
    if (!closed || points.length <= MIN_LOOP_POINTS) continue

    // Cut-and-fill: Laplacian rounds iron the contour's wiggles into a graded
    // line, the way a real railway earthworks its way along a hillside.
    for (let round = 0; round < 4; round++) {
      const smoothed = points.map((point, index) => {
        const previous = points[(index - 1 + points.length) % points.length]
        const next = points[(index + 1) % points.length]
        return new Vector3(
          point.x * 0.5 + (previous.x + next.x) * 0.25,
          0,
          point.z * 0.5 + (previous.z + next.z) * 0.25
        )
      })
      points.splice(0, points.length, ...smoothed)
    }

    // A pinched ribbon of a contour closes too — demand a FAT loop: real
    // enclosed area, and opposite sides that never crowd each other.
    let area = 0
    for (let index = 0; index < points.length; index++) {
      const here = points[index]
      const next = points[(index + 1) % points.length]
      area += here.x * next.z - next.x * here.z
    }
    if (Math.abs(area) / 2 < MIN_LOOP_AREA) continue
    const crowded = points.some((here, index) =>
      points.some((there, otherIndex) => {
        const gap = Math.min(
          Math.abs(index - otherIndex),
          points.length - Math.abs(index - otherIndex)
        )
        return gap > 6 && Math.hypot(here.x - there.x, here.z - there.z) < CROWD_DISTANCE
      })
    )
    if (crowded) continue

    // And NEVER over itself: a figure-eight needs junction points we don't
    // build — reject any pair of non-adjacent segments that intersect.
    if (loopCrossesItself(points)) continue

    points.forEach(point => {
      point.y = sampler(point.x, point.z) + 0.1
    })
    return points
  }
  return undefined
}

/**
 * The two-tier track rule for a candidate rail point. In open country the
 * full berth holds; between two flanking passes the hard floor takes over
 * (the little train threading the rows of tiles is the payoff), but never
 * near a tile's own center, where markers overhang.
 */
const clearOfTrackTiered = (
  x: number,
  z: number,
  path: TilePathResult,
  tileCenters: Vector3[]
): boolean => {
  const { shelfPoints, spacing } = path
  const floor = CORRIDOR_FLOOR * spacing
  const berth = TRACK_CLEARANCE * spacing
  // Fast pass: nearest distance only — most points stand in open country
  // and never need the corridor examination.
  let nearest = Infinity
  for (const point of shelfPoints) {
    const distance = Math.hypot(point.x - x, point.z - z)
    if (distance < nearest) nearest = distance
  }
  if (nearest < floor) return false
  if (nearest >= berth) return true
  // Sub-berth: a genuine corridor only — track on BOTH sides.
  const near = CORRIDOR_NEAR * spacing
  const flankers: Vector3[] = []
  for (const point of shelfPoints) {
    if (Math.hypot(point.x - x, point.z - z) < near) flankers.push(point)
  }
  let corridor = false
  for (let a = 0; a < flankers.length && !corridor; a++) {
    for (let b = a + 1; b < flankers.length && !corridor; b++) {
      const angleA = Math.atan2(flankers[a].x - x, flankers[a].z - z)
      const angleB = Math.atan2(flankers[b].x - x, flankers[b].z - z)
      let spreadAngle = Math.abs(angleA - angleB)
      if (spreadAngle > Math.PI) spreadAngle = 2 * Math.PI - spreadAngle
      if (spreadAngle > 2.2) corridor = true
    }
  }
  if (!corridor) return false
  const tileGap = CORRIDOR_TILE_CLEARANCE * spacing
  return tileCenters.every(center => Math.hypot(center.x - x, center.z - z) >= tileGap)
}

/**
 * The map-spanning traverse: from a seeded grade-band start the line marches
 * BOTH ways, blending a persistent bearing with the local contour direction
 * (valleys and passes over summits), until each end runs off the sheet past
 * the page fade. Everything the board already placed is honoured, the track
 * under the two-tier corridor rule with an absolute never-cross guarantee.
 */
export const pickRailwayTraverse = (
  seed: string,
  path: TilePathResult,
  pond: PondSite | undefined,
  summit: SummitSite | undefined,
  river: RiverPath | undefined,
  scenery: ScenerySites,
  sampler: HeightSampler,
  lake?: LakeSite,
  town?: TownSite,
  waymarks?: WaymarkSite[]
): { points: Vector3[]; bridges: RailwayRoute['bridges'] } | undefined => {
  const random = Alea(`${seed}:railway`)
  if (random() > RAILWAY_CHANCE) return undefined

  const { shelfPoints, spacing } = path
  const tileCenters = path.transforms.map(transform => transform.position)
  const obstacleAt = railObstacleAt({
    pond,
    summit,
    river,
    scenery,
    lake,
    town,
    waymarks,
    spacing,
  })

  // 'hard' ground the line can never take; the 'river' can be BRIDGED — a
  // trestle viaduct where the crossing is near-square. The cheap feature
  // checks run before the shelf scan (its cost dominates the march).
  const blockedForRail = (x: number, z: number): 'hard' | 'river' | undefined => {
    const obstacle = obstacleAt(x, z)
    if (obstacle) return obstacle
    return clearOfTrackTiered(x, z, path, tileCenters) ? undefined : 'hard'
  }
  const clearForRail = (x: number, z: number): boolean => blockedForRail(x, z) === undefined

  /** The rail direction crossing the water for real: the chord from the
   *  near bank to the far bank must cut the river's own polyline. */
  const chordCutsRiver = (a: Vector3, b: Vector3): boolean => {
    if (!river) return false
    for (let index = 0; index < river.points.length - 1; index++) {
      if (segmentsIntersect(a, b, river.points[index], river.points[index + 1])) return true
    }
    return false
  }

  /** Take the river on a straight trestle span: near-square to the flow,
   *  bounded length, everything else still honoured mid-span. Returns the
   *  span's points (wet ones registered as bridge deck) and the far bank. */
  const tryBridge = (
    fromX: number,
    fromZ: number,
    directionX: number,
    directionZ: number,
    bridgeSet: Set<Vector3>
  ):
    | {
        span: Vector3[]
        exitX: number
        exitZ: number
        exitDirectionX: number
        exitDirectionZ: number
      }
    | undefined => {
    if (!river) return undefined
    let nearest = Infinity
    let anchor = 0
    river.points.forEach((point, index) => {
      const distance = (point.x - fromX) ** 2 + (point.z - fromZ) ** 2
      if (distance < nearest) {
        nearest = distance
        anchor = index
      }
    })
    const upstream = river.points[Math.max(anchor - 2, 0)]
    const downstream = river.points[Math.min(anchor + 2, river.points.length - 1)]
    const flow = new Vector3(downstream.x - upstream.x, 0, downstream.z - upstream.z)
    if (flow.lengthSq() < 1e-6) return undefined
    flow.normalize()
    if (Math.abs(directionX * flow.x + directionZ * flow.z) > BRIDGE_DOT_MAX) {
      return undefined
    }
    // Snap the span to the flow's perpendicular, signed to point AT the
    // water (the march's own sign can run parallel to the bank forever).
    const toRiver = river.points[anchor]
    const across =
      Math.sign((toRiver.x - fromX) * -flow.z + (toRiver.z - fromZ) * flow.x) || 1
    const spanX = -flow.z * across
    const spanZ = flow.x * across

    const gap = river.width + 2.5
    const inGap = (x: number, z: number): boolean => {
      for (const point of river.points) {
        if (Math.hypot(point.x - x, point.z - z) < gap) return true
      }
      return false
    }

    const span: Vector3[] = []
    let x = fromX
    let z = fromZ
    let spanLength = 0
    let approach = 0
    let wet = false
    for (let walk = 0; walk < Math.ceil((BRIDGE_MAX_SPAN * 2.2) / BRIDGE_STRIDE); walk++) {
      x += spanX * BRIDGE_STRIDE
      z += spanZ * BRIDGE_STRIDE
      if (blockedForRail(x, z) === 'hard') {
        return undefined
      }
      const point = new Vector3(x, 0, z)
      if (inGap(x, z)) {
        wet = true
        spanLength += BRIDGE_STRIDE
        if (spanLength > BRIDGE_MAX_SPAN) {
          return undefined
        }
        span.push(point)
        bridgeSet.add(point)
        continue
      }
      if (!wet) {
        // Dry ground BEFORE the water is just the approach — keep walking.
        approach += BRIDGE_STRIDE
        if (approach > 6) {
          return undefined
        }
        span.push(point)
        continue
      }
      span.push(point)
      if (!chordCutsRiver(new Vector3(fromX, 0, fromZ), point)) {
        return undefined
      }
      // Two more clear strides onto the far bank, so the resumed march
      // stands properly OFF the water — an exit hugging the gap edge used
      // to graze straight back in and burn the second bridge returning.
      for (let clear = 0; clear < 2; clear++) {
        const clearX = x + spanX * BRIDGE_STRIDE
        const clearZ = z + spanZ * BRIDGE_STRIDE
        if (blockedForRail(clearX, clearZ) !== undefined) break
        x = clearX
        z = clearZ
        span.push(new Vector3(x, 0, z))
      }
      return { span, exitX: x, exitZ: z, exitDirectionX: spanX, exitDirectionZ: spanZ }
    }
    return undefined
  }

  /** One direction of the march; returns the walked points (start excluded)
   *  ending past the sheet fade, or undefined when the country closes in. */
  const marchOut = (
    startX: number,
    startZ: number,
    bearingX: number,
    bearingZ: number,
    bridgeSet: Set<Vector3>,
    bridgesUsed: { count: number }
  ): Vector3[] | undefined => {
    const points: Vector3[] = []
    let x = startX
    let z = startZ
    let directionX = bearingX
    let directionZ = bearingZ
    let sinceBridge = Infinity
    for (let step = 0; step < TRAVERSE_MAX_STEPS; step++) {
      const gradientX = (sampler(x + 1, z) - sampler(x - 1, z)) / 2
      const gradientZ = (sampler(x, z + 1) - sampler(x, z - 1)) / 2
      // Contour direction, signed to keep going the way we are going.
      let contourX = -gradientZ
      let contourZ = gradientX
      const contourMagnitude = Math.hypot(contourX, contourZ) || 1
      contourX /= contourMagnitude
      contourZ /= contourMagnitude
      if (contourX * directionX + contourZ * directionZ < 0) {
        contourX = -contourX
        contourZ = -contourZ
      }
      // The blend: bearing keeps the line honest about crossing the map,
      // contour keeps the grade honest about the terrain.
      let stepX = bearingX * 0.45 + contourX * 0.55
      let stepZ = bearingZ * 0.45 + contourZ * 0.55
      let magnitude = Math.hypot(stepX, stepZ) || 1
      let nextX = x + (stepX / magnitude) * TRAVERSE_STEP
      let nextZ = z + (stepZ / magnitude) * TRAVERSE_STEP
      if (Math.abs(sampler(nextX, nextZ) - sampler(x, z)) > TRAVERSE_MAX_RISE) {
        // Too steep dead ahead — take the pure contour line this stride.
        stepX = contourX
        stepZ = contourZ
        magnitude = 1
        nextX = x + contourX * TRAVERSE_STEP
        nextZ = z + contourZ * TRAVERSE_STEP
        if (Math.abs(sampler(nextX, nextZ) - sampler(x, z)) > TRAVERSE_MAX_RISE)
          return undefined
      }
      const stepDirectionX = stepX / magnitude
      const stepDirectionZ = stepZ / magnitude
      if (Math.hypot(nextX, nextZ) > TRAVERSE_EXIT) {
        points.push(new Vector3(nextX, 0, nextZ))
        return points
      }
      const block = blockedForRail(nextX, nextZ)
      // A fresh bridge needs open country behind it — never a zigzag of
      // spans stitched straight back over the same water.
      if (block === 'river' && bridgesUsed.count < MAX_BRIDGES && sinceBridge > 8) {
        const crossed = tryBridge(x, z, stepDirectionX, stepDirectionZ, bridgeSet)
        if (!crossed) return undefined
        bridgesUsed.count++
        points.push(...crossed.span)
        x = crossed.exitX
        z = crossed.exitZ
        directionX = crossed.exitDirectionX
        directionZ = crossed.exitDirectionZ
        sinceBridge = 0
        continue
      }
      if (block) return undefined
      x = nextX
      z = nextZ
      directionX = stepDirectionX
      directionZ = stepDirectionZ
      sinceBridge += TRAVERSE_STEP
      points.push(new Vector3(x, 0, z))
    }
    return undefined
  }

  for (let probe = 0; probe < TRAVERSE_PROBES; probe++) {
    const startX = (random() - 0.5) * 2 * (EDGE_FADE_START - 8)
    const startZ = (random() - 0.5) * 2 * (EDGE_FADE_START - 8)
    const gradeY = sampler(startX, startZ)
    if (gradeY < GRADE_MIN || gradeY > GRADE_MAX) continue
    if (!clearForRail(startX, startZ)) continue
    const bearing = random() * Math.PI * 2
    const bearingX = Math.sin(bearing)
    const bearingZ = Math.cos(bearing)

    const bridgeSet = new Set<Vector3>()
    const bridgesUsed = { count: 0 }
    const ahead = marchOut(startX, startZ, bearingX, bearingZ, bridgeSet, bridgesUsed)
    if (!ahead) continue
    const behind = marchOut(startX, startZ, -bearingX, -bearingZ, bridgeSet, bridgesUsed)
    if (!behind) continue

    const points = [...behind.reverse(), new Vector3(startX, 0, startZ), ...ahead]
    let length = 0
    for (let index = 1; index < points.length; index++) {
      length += Math.hypot(
        points[index].x - points[index - 1].x,
        points[index].z - points[index - 1].z
      )
    }
    if (length < TRAVERSE_MIN_LENGTH) {
      continue
    }
    // Distinct sides: the two sheet exits stand far apart, or the "span"
    // is just a hairpin out and back through the same margin.
    const first = points[0]
    const last = points[points.length - 1]
    if (Math.hypot(first.x - last.x, first.z - last.z) < EDGE_FADE_START * 1.1) {
      continue
    }

    // Cut-and-fill rounds (ends pinned — they hold the sheet exits; bridge
    // decks pinned too — a span was walked dead straight and stays so).
    smoothPolyline(points, 4, 'xz', point => bridgeSet.has(point))

    // Self-crowding: distant stretches of the line never crowd each other.
    const crowded = points.some((here, index) =>
      points.some((there, otherIndex) => {
        if (Math.abs(index - otherIndex) <= 6) return false
        return Math.hypot(here.x - there.x, here.z - there.z) < CROWD_DISTANCE
      })
    )
    if (crowded) {
      continue
    }
    if (lineCrossesItself(points)) {
      continue
    }
    // Smoothing may have drifted a corridor point onto the floor — verify,
    // and hold the absolute never-cross guarantee against the track itself.
    if (!points.every(point => clearOfTrackTiered(point.x, point.z, path, tileCenters))) {
      continue
    }
    if (polylinesIntersect(points, shelfPoints)) {
      continue
    }

    // The rail line's height: terrain-following, then ironed along its
    // length so dips read as trestlework instead of rollercoaster — floats
    // capped, or the route is refused. Bridge decks take a straight grade
    // between their two banks instead of following the carved bed.
    for (const point of points) {
      if (!bridgeSet.has(point)) point.y = sampler(point.x, point.z) + 0.1
    }
    let runStart = 0
    while (runStart < points.length) {
      if (!bridgeSet.has(points[runStart])) {
        runStart++
        continue
      }
      let runEnd = runStart
      while (runEnd < points.length && bridgeSet.has(points[runEnd])) runEnd++
      const nearBankY = points[Math.max(runStart - 1, 0)].y
      const farBankY = points[Math.min(runEnd, points.length - 1)].y
      for (let index = runStart; index < runEnd; index++) {
        const t = (index - runStart + 1) / (runEnd - runStart + 1)
        points[index].y = nearBankY + (farBankY - nearBankY) * t
      }
      runStart = runEnd
    }
    smoothPolyline(points, 3, 'y', point => bridgeSet.has(point))
    let floats = true
    for (const point of points) {
      const bridged = bridgeSet.has(point)
      const ground = sampler(point.x, point.z) + 0.1
      if (!bridged && point.y < ground) point.y = ground
      if (point.y - ground > (bridged ? BRIDGE_FLOAT_CAP : TRAVERSE_MAX_FLOAT)) {
        floats = false
        break
      }
    }
    if (!floats) {
      continue
    }

    // Bridge metadata off the deck runs, for the build and the tests.
    const bridges: RailwayRoute['bridges'] = []
    let bridgeStart = -1
    for (let index = 0; index <= points.length; index++) {
      const onBridge = index < points.length && bridgeSet.has(points[index])
      if (onBridge && bridgeStart < 0) bridgeStart = index
      if (!onBridge && bridgeStart >= 0) {
        const first = points[bridgeStart]
        const last = points[index - 1]
        bridges.push({
          center: new Vector3(
            (first.x + last.x) / 2,
            (first.y + last.y) / 2,
            (first.z + last.z) / 2
          ),
          halfLength:
            Math.hypot(last.x - first.x, last.z - first.z) / 2 + BRIDGE_STRIDE,
        })
        bridgeStart = -1
      }
    }

    return { points, bridges }
  }
  return undefined
}

/**
 * The railway deal: a separate kind coin (its own stream, so the loop
 * survey's draws never move) sends a seed to the traverse first or the loop
 * first. Boards whose coin lands 'loop' keep their shipped loop exactly;
 * traverse-coin boards change by design — and fall BACK to the loop survey
 * when no traverse sites, so the railway deal rate never drops below main's.
 */
export const pickRailwayRoute = (
  seed: string,
  path: TilePathResult,
  pond: PondSite | undefined,
  summit: SummitSite | undefined,
  river: RiverPath | undefined,
  scenery: ScenerySites,
  sampler: HeightSampler,
  lake?: LakeSite,
  town?: TownSite,
  waymarks?: WaymarkSite[]
): RailwayRoute | undefined => {
  const traverse = Alea(`${seed}:railway-kind`)() < 0.5
  if (traverse) {
    const line = pickRailwayTraverse(
      seed,
      path,
      pond,
      summit,
      river,
      scenery,
      sampler,
      lake,
      town,
      waymarks
    )
    if (line) return { points: line.points, closed: false, bridges: line.bridges }
  }
  const points = pickRailwayLoop(
    seed,
    path,
    pond,
    summit,
    river,
    scenery,
    sampler,
    lake,
    town,
    waymarks
  )
  return points ? { points, closed: true, bridges: [] } : undefined
}


/**
 * The railway made flesh: twin ink rails with perpendicular sleeper ticks in
 * the classic map symbol, and an old steam train — boiler, funnel, dome, red
 * cab, gray puffs — hauling two wagons round the loop. The train is scenery,
 * so it wears the biome's palette the way the trees do; game pieces still
 * never read biome.
 */
export const buildRailway = (
  route: RailwayRoute,
  biome: BoardBiome,
  sampler: HeightSampler
): RailwayBuild => {
  const { points, closed } = route
  const meshes: RailwayBuild['meshes'] = []
  const matrix = new Matrix4()
  const curve = new CatmullRomCurve3(points, closed, 'centripetal')
  const railLength = curve.getLength()
  const railSamples = curve.getSpacedPoints(Math.ceil(railLength / 1.15))
  // Closed-curve spaced points repeat the seam — drop the duplicate. Open
  // traverses keep both sheet-edge ends.
  if (closed) railSamples.pop()
  const at = (index: number) =>
    closed
      ? railSamples[(index + railSamples.length) % railSamples.length]
      : railSamples[clamp(index, 0, railSamples.length - 1)]

  // Twin rails: offset curves either side of the centerline.
  const ink = new MeshBasicMaterial({ color: biome.major })
  for (const offsetSide of [-0.32, 0.32]) {
    const offset = railSamples.map((point, index) => {
      const next = at(index + 1)
      const previous = at(index - 1)
      const tangent = new Vector3().subVectors(next, previous).setY(0).normalize()
      return new Vector3(
        point.x - tangent.z * offsetSide,
        point.y + 0.06,
        point.z + tangent.x * offsetSide
      )
    })
    const rail = new TubeGeometry(
      new CatmullRomCurve3(offset, closed, 'centripetal'),
      offset.length,
      0.055,
      5,
      closed
    )
    meshes.push(new Mesh(rail, ink))
  }

  // Sleepers: the map symbol's cross-ticks, instanced along the line.
  const sleeper = new BoxGeometry(1.0, 0.05, 0.22)
  const sleeperMesh = new InstancedMesh(
    sleeper,
    new MeshBasicMaterial({ color: biome.trunkColor }),
    railSamples.length
  )
  const sleeperQuaternion = new Quaternion()
  const upAxis = new Vector3(0, 1, 0)
  railSamples.forEach((point, index) => {
    const next = at(index + 1)
    const previous = at(index - 1)
    const yaw = Math.atan2(next.x - previous.x, next.z - previous.z)
    // The box is long in X; yawing +Z onto the tangent leaves X ACROSS the
    // rails — a sleeper, not a stringer.
    sleeperQuaternion.setFromAxisAngle(upAxis, yaw)
    matrix.compose(
      new Vector3(point.x, point.y + 0.02, point.z),
      sleeperQuaternion,
      new Vector3(1, 1, 1)
    )
    sleeperMesh.setMatrixAt(index, matrix)
  })
  meshes.push(sleeperMesh)

  // Trestlework: wherever the graded line floats over a dip, posts drop to
  // the ground — the earthworks made visible. Loops hug the terrain, so
  // this is effectively the traverse's signature.
  const trestles: { x: number; z: number; top: number; ground: number }[] = []
  for (let index = 0; index < railSamples.length; index += 2) {
    const point = railSamples[index]
    const ground = sampler(point.x, point.z)
    if (point.y - ground > TRESTLE_MIN_GAP) {
      trestles.push({ x: point.x, z: point.z, top: point.y, ground })
    }
  }
  if (trestles.length) {
    const post = new BoxGeometry(0.14, 1, 0.14)
    post.translate(0, 0.5, 0)
    const postMesh = new InstancedMesh(
      post,
      new MeshBasicMaterial({ color: biome.trunkColor }),
      trestles.length
    )
    trestles.forEach((trestle, index) => {
      matrix.makeScale(1, trestle.top - trestle.ground + 0.06, 1)
      matrix.setPosition(trestle.x, trestle.ground - 0.04, trestle.z)
      postMesh.setMatrixAt(index, matrix)
    })
    meshes.push(postMesh)
  }

  // The train: an OLD STEAM engine — round boiler, tall funnel, rear cab,
  // puffing smoke — hauling two wagons. Every vehicle carries its OWN
  // transparent materials — one code path; the loop simply never fades.
  const vehicleMaterials: MeshBasicMaterial[][] = []
  const vehicleMaterial = (bucket: MeshBasicMaterial[], color: string): MeshBasicMaterial => {
    const material = new MeshBasicMaterial({ color, transparent: true })
    bucket.push(material)
    return material
  }

  const makeLoco = () => {
    const bucket: MeshBasicMaterial[] = []
    const locoInk = vehicleMaterial(bucket, biome.major)
    const locoAccent = vehicleMaterial(bucket, BOARD_COLORS.hiorAnge)
    const loco = new Group()
    const boiler = new Mesh(new CylinderGeometry(0.3, 0.3, 1.25, 12), locoInk)
    boiler.rotation.z = Math.PI / 2
    boiler.position.set(0.18, 0.62, 0)
    loco.add(boiler)
    const smokebox = new Mesh(new CylinderGeometry(0.32, 0.32, 0.18, 12), locoInk)
    smokebox.rotation.z = Math.PI / 2
    smokebox.position.set(0.88, 0.62, 0)
    loco.add(smokebox)
    const funnel = new Mesh(new CylinderGeometry(0.14, 0.08, 0.5, 10), locoInk)
    funnel.position.set(0.74, 1.1, 0)
    loco.add(funnel)
    const dome = new Mesh(new SphereGeometry(0.13, 10, 8), locoInk)
    dome.position.set(0.2, 0.94, 0)
    loco.add(dome)
    const chassis = new Mesh(new BoxGeometry(1.9, 0.22, 0.86), locoInk)
    chassis.position.y = 0.24
    loco.add(chassis)
    const cab = new Mesh(new BoxGeometry(0.62, 0.7, 0.88), locoAccent)
    cab.position.set(-0.62, 0.72, 0)
    loco.add(cab)
    const cabRoof = new Mesh(new BoxGeometry(0.74, 0.09, 0.98), locoInk)
    cabRoof.position.set(-0.62, 1.12, 0)
    loco.add(cabRoof)
    vehicleMaterials.push(bucket)
    // The smoke: the shared puff idiom, cycling up out of the funnel and
    // trailing back as the engine pulls away beneath it.
    const smoke = makeSmokePuffs(4, new Vector3(0.74, 1.35, 0), new Vector3(-1.2, 1.6, 0), {
      rate: 0.5,
      radius: 0.2,
      baseOpacity: 0.8,
    })
    smoke.puffs.forEach(puff => loco.add(puff))
    return { loco, smoke }
  }
  const makeWagon = (body: string) => {
    const bucket: MeshBasicMaterial[] = []
    const wagon = new Group()
    const hull = new Mesh(new BoxGeometry(1.4, 0.55, 0.82), vehicleMaterial(bucket, body))
    hull.position.y = 0.52
    wagon.add(hull)
    const chassis = new Mesh(new BoxGeometry(1.5, 0.18, 0.86), vehicleMaterial(bucket, biome.major))
    chassis.position.y = 0.2
    wagon.add(chassis)
    vehicleMaterials.push(bucket)
    return wagon
  }
  const { loco, smoke } = makeLoco()
  const vehicles = [loco, makeWagon(BOARD_COLORS.hiorAnge), makeWagon(biome.foliageColor)]
  meshes.push(...vehicles)

  const gapParam = VEHICLE_GAP / railLength
  const loopSeconds = railLength / TRAIN_SPEED

  const placeVehicle = (vehicle: Group, t: number) => {
    // Both kinds wrap t: the loop is closed, and the traverse's ends are
    // faded to nothing, so the wrap-around teleport happens off-sheet.
    const wrapped = ((t % 1) + 1) % 1
    const point = curve.getPointAt(wrapped)
    const tangent = curve.getTangentAt(wrapped)
    vehicle.position.copy(point)
    vehicle.rotation.y = Math.atan2(tangent.x, tangent.z) - Math.PI / 2
    return wrapped
  }

  /** 1 in the line's heart, easing to 0 over the fade fraction at each end
   *  of an open traverse — the train leaves the map like a railway leaves
   *  the sheet. */
  const sheetFade = (t: number): number => {
    if (closed) return 1
    const edge = Math.min(t, 1 - t)
    return clamp01(edge / TRAVERSE_FADE)
  }

  const applyFade = (vehicleIndex: number, fade: number) => {
    if (closed) return
    for (const material of vehicleMaterials[vehicleIndex]) material.opacity = fade
  }

  // Parked mid-line at build so a still scene (reduced motion, paused loop)
  // shows the train as a prop rather than an absence.
  vehicles.forEach((vehicle, index) => {
    const t = placeVehicle(vehicle, PARKED_T - index * gapParam)
    applyFade(index, sheetFade(t))
  })

  const drive = (time: number) => {
    if (prefersReducedMotion()) return
    const phase = (time / loopSeconds) % 1
    let locoFade = 1
    vehicles.forEach((vehicle, index) => {
      const t = placeVehicle(vehicle, phase - index * gapParam)
      const fade = sheetFade(t)
      if (index === 0) locoFade = fade
      applyFade(index, fade)
      // The chug: a tiny bob, out of phase per vehicle.
      vehicle.position.y += Math.sin(time * 9 + index * 1.7) * 0.025
    })
    // Steam thins with its engine at the sheet edge.
    smoke.animate(time, locoFade)
  }

  return { meshes, drive }
}
