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
import type { BoardBiome } from './biomes'
import { type LakeSite, lakeShoreDistance } from './lake'
import type { TownSite } from './town'
import type { TilePathResult } from './path'
import type { RiverPath } from './river'
import type { ScenerySites } from './scenery'
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

export interface RailwayBuild {
  meshes: (Mesh | InstancedMesh | Group)[]
  /** Advance the train; TopoScene's landscape ticker calls this each frame. */
  drive: (time: number) => void
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
  town?: TownSite
): Vector3[] | undefined => {
  const random = Alea(`${seed}:railway`)
  if (random() > RAILWAY_CHANCE) return undefined

  const { shelfPoints, spacing } = path
  const clearance = TRACK_CLEARANCE * spacing
  const clearanceSquared = clearance * clearance

  const clearForRail = (x: number, z: number): boolean => {
    if (Math.hypot(x, z) > EDGE_FADE_START - 4) return false
    for (const point of shelfPoints) {
      const dx = point.x - x
      const dz = point.z - z
      if (dx * dx + dz * dz < clearanceSquared) return false
    }
    if (pond && Math.hypot(pond.center.x - x, pond.center.z - z) < pond.basinRadius + 3)
      return false
    // ×1.05 matches the summit site's own clearance convention — shoulder
    // peaks are sized against exactly that reach, so the line can never ride
    // up a shoulder's foot.
    if (
      summit &&
      Math.hypot(summit.center.x - x, summit.center.z - z) < summit.radius + spacing * 1.05
    )
      return false
    if (river) {
      const gap = river.width + 2.5
      for (const point of river.points) {
        if (Math.hypot(point.x - x, point.z - z) < gap) return false
      }
    }
    if (lake && lakeShoreDistance(lake, x, z) < 2.5) return false
    if (town && Math.hypot(town.center.x - x, town.center.z - z) < town.radius + 2.5)
      return false
    for (const cairn of scenery.cairns) {
      if (Math.hypot(cairn.x - x, cairn.z - z) < 5) return false
    }
    if (scenery.compass) {
      const compass = scenery.compass
      if (Math.hypot(compass.x - x, compass.z - z) < spacing * 3) return false
    }
    if (scenery.stones) {
      const stones = scenery.stones.center
      if (Math.hypot(stones.x - x, stones.z - z) < spacing * 1.5) return false
    }
    if (scenery.scaleBar) {
      const scaleBar = scenery.scaleBar.center
      if (Math.hypot(scaleBar.x - x, scaleBar.z - z) < 4) return false
    }
    return true
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

/** Non-adjacent segment intersection over a closed XZ polygon. */
export const loopCrossesItself = (points: Vector3[]): boolean => {
  const side = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) =>
    Math.sign((bx - ax) * (cz - az) - (bz - az) * (cx - ax))
  return points.some((a, index) => {
    const b = points[(index + 1) % points.length]
    return points.some((c, otherIndex) => {
      const gap = Math.min(
        Math.abs(index - otherIndex),
        points.length - Math.abs(index - otherIndex)
      )
      if (gap < 2) return false
      const d = points[(otherIndex + 1) % points.length]
      return (
        side(a.x, a.z, b.x, b.z, c.x, c.z) !== side(a.x, a.z, b.x, b.z, d.x, d.z) &&
        side(c.x, c.z, d.x, d.z, a.x, a.z) !== side(c.x, c.z, d.x, d.z, b.x, b.z)
      )
    })
  })
}

/**
 * The railway made flesh: twin ink rails with perpendicular sleeper ticks in
 * the classic map symbol, and an old steam train — boiler, funnel, dome, red
 * cab, gray puffs — hauling two wagons round the loop. The train is scenery,
 * so it wears the biome's palette the way the trees do; game pieces still
 * never read biome.
 */
export const buildRailway = (loop: Vector3[], biome: BoardBiome): RailwayBuild => {
  const meshes: RailwayBuild['meshes'] = []
  const matrix = new Matrix4()
  const curve = new CatmullRomCurve3(loop, true, 'centripetal')
  const railLength = curve.getLength()
  // Closed-curve spaced points repeat the seam — drop the duplicate.
  const railSamples = curve.getSpacedPoints(Math.ceil(railLength / 1.15))
  railSamples.pop()
  const wrap = (index: number) => (index + railSamples.length) % railSamples.length

  // Twin rails: closed offset curves either side of the centerline.
  const ink = new MeshBasicMaterial({ color: biome.major })
  for (const offsetSide of [-0.32, 0.32]) {
    const offset = railSamples.map((point, index) => {
      const next = railSamples[wrap(index + 1)]
      const previous = railSamples[wrap(index - 1)]
      const tangent = new Vector3().subVectors(next, previous).setY(0).normalize()
      return new Vector3(
        point.x - tangent.z * offsetSide,
        point.y + 0.06,
        point.z + tangent.x * offsetSide
      )
    })
    const rail = new TubeGeometry(
      new CatmullRomCurve3(offset, true, 'centripetal'),
      offset.length,
      0.055,
      5,
      true
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
    const next = railSamples[wrap(index + 1)]
    const previous = railSamples[wrap(index - 1)]
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

  // The train: an OLD STEAM engine — round boiler, tall funnel, rear cab,
  // puffing smoke — hauling two wagons.
  const accent = new MeshBasicMaterial({ color: '#ec6247' })
  const makeLoco = () => {
    const loco = new Group()
    const boiler = new Mesh(new CylinderGeometry(0.3, 0.3, 1.25, 12), ink)
    boiler.rotation.z = Math.PI / 2
    boiler.position.set(0.18, 0.62, 0)
    loco.add(boiler)
    const smokebox = new Mesh(new CylinderGeometry(0.32, 0.32, 0.18, 12), ink)
    smokebox.rotation.z = Math.PI / 2
    smokebox.position.set(0.88, 0.62, 0)
    loco.add(smokebox)
    const funnel = new Mesh(new CylinderGeometry(0.14, 0.08, 0.5, 10), ink)
    funnel.position.set(0.74, 1.1, 0)
    loco.add(funnel)
    const dome = new Mesh(new SphereGeometry(0.13, 10, 8), ink)
    dome.position.set(0.2, 0.94, 0)
    loco.add(dome)
    const chassis = new Mesh(new BoxGeometry(1.9, 0.22, 0.86), ink)
    chassis.position.y = 0.24
    loco.add(chassis)
    const cab = new Mesh(new BoxGeometry(0.62, 0.7, 0.88), accent)
    cab.position.set(-0.62, 0.72, 0)
    loco.add(cab)
    const cabRoof = new Mesh(new BoxGeometry(0.74, 0.09, 0.98), ink)
    cabRoof.position.set(-0.62, 1.12, 0)
    loco.add(cabRoof)
    // The smoke: puffs cycling up out of the funnel (see drive). A neutral
    // gray so they read against every biome's page tint.
    const puffs: Mesh[] = []
    for (let index = 0; index < 4; index++) {
      const puff = new Mesh(
        new SphereGeometry(0.2, 8, 6),
        new MeshBasicMaterial({ color: '#9aa4ae', transparent: true, opacity: 0.8 })
      )
      puff.position.set(0.74, 1.4, 0)
      loco.add(puff)
      puffs.push(puff)
    }
    return { loco, puffs }
  }
  const makeWagon = (body: string) => {
    const wagon = new Group()
    const hull = new Mesh(new BoxGeometry(1.4, 0.55, 0.82), new MeshBasicMaterial({ color: body }))
    hull.position.y = 0.52
    wagon.add(hull)
    const chassis = new Mesh(new BoxGeometry(1.5, 0.18, 0.86), ink)
    chassis.position.y = 0.2
    wagon.add(chassis)
    return wagon
  }
  const { loco, puffs } = makeLoco()
  const vehicles = [loco, makeWagon('#ec6247'), makeWagon(biome.foliageColor)]
  meshes.push(...vehicles)

  const gapParam = VEHICLE_GAP / railLength
  const loopSeconds = railLength / TRAIN_SPEED

  const placeVehicle = (vehicle: Group, t: number) => {
    // The loop is closed — t wraps instead of clamping.
    const wrapped = ((t % 1) + 1) % 1
    const point = curve.getPointAt(wrapped)
    const tangent = curve.getTangentAt(wrapped)
    vehicle.position.copy(point)
    vehicle.rotation.y = Math.atan2(tangent.x, tangent.z) - Math.PI / 2
  }

  // Parked mid-line at build so a still scene (reduced motion, paused loop)
  // shows the train as a prop rather than an absence.
  vehicles.forEach((vehicle, index) => placeVehicle(vehicle, PARKED_T - index * gapParam))

  const drive = (time: number) => {
    if (prefersReducedMotion()) return
    // Steam: each puff cycles up out of the funnel, swelling and thinning,
    // trailing back as the engine pulls away beneath it.
    puffs.forEach((puff, index) => {
      const cycle = (time * 0.5 + index / puffs.length) % 1
      puff.position.set(0.74 - cycle * 1.2, 1.35 + cycle * 1.6, 0)
      const swell = 0.6 + cycle * 1.6
      puff.scale.set(swell, swell, swell)
      ;(puff.material as MeshBasicMaterial).opacity = 0.8 * (1 - cycle * cycle)
    })
    const phase = (time / loopSeconds) % 1
    vehicles.forEach((vehicle, index) => {
      placeVehicle(vehicle, phase - index * gapParam)
      // The chug: a tiny bob, out of phase per vehicle.
      vehicle.position.y += Math.sin(time * 9 + index * 1.7) * 0.025
    })
  }

  return { meshes, drive }
}
