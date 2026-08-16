import Alea from 'alea'
import { Vector3 } from 'three'
import type { HeightSampler } from './terrain'
import { BOARD_SIZE, EDGE_FADE_START } from './terrain'
import type { TilePathResult } from './path'
import type { RiverPath } from './river'
import type { PondSite } from './water'
import type { SummitSite } from './summit'

/**
 * Seeded, purely-visual furniture on the open terrain the track leaves empty:
 * survey cairns crowning the tallest off-track hills (the land reads as
 * SURVEYED — on theme for a geography game) and a flat compass-rose ink
 * decal on a quiet plain. Placement only — geometry lives in board-builder
 * with the other mesh construction.
 */
export interface ScenerySites {
  /** Ground points of the cairned hilltops (y = terrain height). */
  cairns: Vector3[]
  /** Ground point of the compass rose, or undefined when no quiet plain. */
  compass?: Vector3
}

/** How far scenery keeps from every track sample (×spacing) — outside the
 *  shelf band and any marker overhang. */
const TRACK_CLEARANCE = 1.6
/** Scan pitch over the landscape (world units). */
const SCAN_STEP = 4
/** Two cairns never crowd one skyline. */
const CAIRN_SEPARATION = 26
/** The compass wants genuinely flat ground — it is a printed decal. */
const COMPASS_MAX_SLOPE = 0.05

export const pickScenerySites = (
  seed: string,
  path: TilePathResult,
  pond: PondSite | undefined,
  summit: SummitSite | undefined,
  sampler: HeightSampler,
  river?: RiverPath
): ScenerySites => {
  const random = Alea(`${seed}:scenery`)
  const { shelfPoints, spacing } = path
  const clearance = TRACK_CLEARANCE * spacing
  const clearanceSquared = clearance * clearance

  const isClear = (x: number, z: number, margin = 0): boolean => {
    if (Math.hypot(x, z) > EDGE_FADE_START - margin) return false
    for (const point of shelfPoints) {
      const dx = point.x - x
      const dz = point.z - z
      if (dx * dx + dz * dz < clearanceSquared) return false
    }
    if (pond) {
      const gap = pond.basinRadius + margin + spacing
      if (Math.hypot(pond.center.x - x, pond.center.z - z) < gap) return false
    }
    if (summit) {
      const gap = summit.radius + margin + spacing
      if (Math.hypot(summit.center.x - x, summit.center.z - z) < gap) return false
    }
    if (river) {
      const gap = river.width + 2
      for (const point of river.points) {
        if (Math.hypot(point.x - x, point.z - z) < gap) return false
      }
    }
    return true
  }

  // Sweep the inner landscape for clear ground, remembering height and slope.
  const half = BOARD_SIZE * 0.62
  const spots: { x: number; z: number; y: number; slope: number }[] = []
  for (let x = -half; x <= half; x += SCAN_STEP) {
    for (let z = -half; z <= half; z += SCAN_STEP) {
      if (!isClear(x, z, SCAN_STEP)) continue
      const y = sampler(x, z)
      const gradientX = (sampler(x + 1, z) - sampler(x - 1, z)) / 2
      const gradientZ = (sampler(x, z + 1) - sampler(x, z - 1)) / 2
      spots.push({ x, z, y, slope: Math.hypot(gradientX, gradientZ) })
    }
  }

  // Cairns: the tallest clear hilltops, kept apart. 1–2 per board, seeded.
  const cairnCount = random() < 0.5 ? 1 : 2
  const byHeight = [...spots].sort((a, b) => b.y - a.y)
  const cairns: Vector3[] = []
  for (const spot of byHeight) {
    if (cairns.length >= cairnCount) break
    if (cairns.some(cairn => Math.hypot(cairn.x - spot.x, cairn.z - spot.z) < CAIRN_SEPARATION))
      continue
    cairns.push(new Vector3(spot.x, spot.y, spot.z))
  }

  // Compass: the flattest clear ground far from the cairns; skip fussy boards.
  const quiet = spots
    .filter(spot => spot.slope <= COMPASS_MAX_SLOPE)
    .filter(spot => cairns.every(cairn => Math.hypot(cairn.x - spot.x, cairn.z - spot.z) > 18))
    .sort((a, b) => a.slope - b.slope)
  const compass = quiet.length ? new Vector3(quiet[0].x, quiet[0].y, quiet[0].z) : undefined

  return { cairns, compass }
}
