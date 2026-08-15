import Alea from 'alea'
import { CatmullRomCurve3, Vector3 } from 'three'
import type { HeightSampler } from './terrain'
import { EDGE_FADE_START, smoothstep } from './terrain'
import type { TilePathResult } from './path'
import type { PondSite } from './water'
import type { SummitSite } from './summit'

/**
 * A decorative river: a seeded stream that rises on high open ground and
 * marches downhill until the landscape stops it — carving a shallow bed the
 * contour shader draws for free, with a translucent water ribbon on top.
 * Purely visual, and it never touches the track: the march STOPS at the
 * track's clearance rather than crossing it (bridged crossings are the
 * follow-up, not v1 — a half-right crossing reads as a flooded board).
 */
export interface RiverPath {
  /** Downstream points at FINE spacing (spline-resampled from the march);
   *  `y` is the WATER surface at that point. Fine points are what keep the
   *  carve and the foam ribbon smooth — the raw march was coarse enough
   *  that its nearest-point scallops read as fractal foam. */
  points: Vector3[]
  /** Big drops detected on the raw march — each hangs a cascade sheet. */
  falls: { top: Vector3; bottom: Vector3 }[]
  /** Carve reach either side of the centerline (world units). */
  width: number
}

/** Roughly as common as the pond — a treat, not a fixture. */
const RIVER_CHANCE = 0.45
/** March step (world units) and cap. */
const MARCH_STEP = 3
const MARCH_LIMIT = 60
/** A stream shorter than this reads as a puddle smear — decline instead. */
const MIN_LENGTH = 26
/** Water sits this far below the local bank, the bed a bit further. */
const WATER_DROP = 0.4
const BED_DROP = 1.1
/** Carve reach either side of the centerline. */
const RIVER_WIDTH = 2.6
/** The stream keeps this many spacings clear of every track pass. */
const TRACK_CLEARANCE = 1.35

export const pickRiverPath = (
  seed: string,
  path: TilePathResult,
  pond: PondSite | undefined,
  summit: SummitSite | undefined,
  sampler: HeightSampler
): RiverPath | undefined => {
  const random = Alea(`${seed}:river`)
  if (random() >= RIVER_CHANCE) return undefined

  const { shelfPoints, spacing } = path
  const clearance = TRACK_CLEARANCE * spacing
  const clearanceSquared = clearance * clearance

  const isOpen = (x: number, z: number): boolean => {
    if (Math.hypot(x, z) > EDGE_FADE_START - 4) return false
    for (const point of shelfPoints) {
      const dx = point.x - x
      const dz = point.z - z
      if (dx * dx + dz * dz < clearanceSquared) return false
    }
    if (pond && Math.hypot(pond.center.x - x, pond.center.z - z) < pond.basinRadius + RIVER_WIDTH)
      return false
    if (
      summit &&
      Math.hypot(summit.center.x - x, summit.center.z - z) < summit.radius + RIVER_WIDTH
    )
      return false
    return true
  }

  // Springs: a few seeded probes over open ground, highest first.
  const springs: Vector3[] = []
  for (let probe = 0; probe < 24; probe++) {
    const x = (random() - 0.5) * 110
    const z = (random() - 0.5) * 110
    if (!isOpen(x, z)) continue
    springs.push(new Vector3(x, sampler(x, z), z))
  }
  springs.sort((a, b) => b.y - a.y)

  for (const spring of springs.slice(0, 5)) {
    const march: Vector3[] = [spring.clone()]
    const position = new Vector3(spring.x, 0, spring.z)
    const momentum = new Vector3()

    const recentLevels: number[] = []
    for (let step = 0; step < MARCH_LIMIT; step++) {
      // Downhill gradient with momentum and a seeded meander wobble.
      const gradientX =
        (sampler(position.x + 1, position.z) - sampler(position.x - 1, position.z)) / 2
      const gradientZ =
        (sampler(position.x, position.z + 1) - sampler(position.x, position.z - 1)) / 2
      const downhill = new Vector3(-gradientX, 0, -gradientZ)
      if (downhill.lengthSq() < 1e-6) break
      downhill.normalize()
      momentum.multiplyScalar(0.55).addScaledVector(downhill, 0.45)
      const wobble = (random() - 0.5) * 0.5
      const heading = Math.atan2(momentum.x, momentum.z) + wobble
      position.x += Math.sin(heading) * MARCH_STEP
      position.z += Math.cos(heading) * MARCH_STEP

      if (!isOpen(position.x, position.z)) break
      const y = sampler(position.x, position.z)
      march.push(new Vector3(position.x, y, position.z))

      // Stagnation cut: in a flat basin the march just meanders in circles
      // and the ribbon overlaps itself into polygon salad — when the water
      // has stopped dropping, the river has ARRIVED. It ends in a pool.
      recentLevels.push(y)
      if (recentLevels.length > 7) recentLevels.shift()
      if (recentLevels.length === 7 && recentLevels[0] - y < 0.18) break
    }

    const length = (march.length - 1) * MARCH_STEP
    if (length < MIN_LENGTH) continue

    // Water must run downhill: clamp the surface non-increasing downstream.
    let level = Infinity
    const coarse = march.map(point => {
      level = Math.min(level, point.y - WATER_DROP)
      return new Vector3(point.x, level, point.z)
    })

    // Falls detect on the RAW march, where a drop is one step.
    const falls: RiverPath['falls'] = []
    for (let index = 0; index < coarse.length - 1; index++) {
      if (coarse[index].y - coarse[index + 1].y >= 1.1)
        falls.push({ top: coarse[index].clone(), bottom: coarse[index + 1].clone() })
    }

    // Fine resample through a spline, then re-clamp: the smooth centerline is
    // what keeps the bed carve and the foam shoreline from scalloping.
    const spline = new CatmullRomCurve3(coarse, false, 'centripetal')
    const fineCount = Math.max(coarse.length * 2, Math.ceil(spline.getLength() / 1.2))
    const points = spline.getSpacedPoints(fineCount)
    let fineLevel = Infinity
    for (const point of points) {
      fineLevel = Math.min(fineLevel, point.y)
      point.y = fineLevel
    }

    return { points, falls, width: RIVER_WIDTH }
  }
  return undefined
}

/**
 * Carve the bed: within `width` of the centerline the terrain blends down to
 * just under the local water surface, smoothstep back to the bank — the
 * same nearest-point recipe as the path shelf, pointed downward.
 */
export const withRiverBed = (sampler: HeightSampler, river: RiverPath): HeightSampler => {
  const { points, width } = river
  return (x, z) => {
    const bank = sampler(x, z)
    let nearestSquared = Infinity
    let waterY = 0
    for (const point of points) {
      const dx = point.x - x
      const dz = point.z - z
      const distanceSquared = dx * dx + dz * dz
      if (distanceSquared < nearestSquared) {
        nearestSquared = distanceSquared
        waterY = point.y
      }
    }
    if (nearestSquared >= width * width) return bank
    const t = smoothstep(Math.sqrt(nearestSquared) / width)
    const bed = Math.min(bank, waterY - (BED_DROP - WATER_DROP))
    return bed * (1 - t) + bank * t
  }
}
