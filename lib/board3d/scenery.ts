import Alea from 'alea'
import { Vector3 } from 'three'
import type { HeightSampler } from './terrain'
import { BOARD_SIZE, EDGE_FADE_START, MAX_ELEVATION } from './terrain'
import type { TilePathResult } from './path'
import type { RiverPath } from './river'
import type { PondSite } from './water'
import type { SummitSite } from './summit'
import { type LakeSite, lakeShoreDistance } from './lake'
import type { TownSite } from './town'

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
  /** A ring of standing stones on a mid-elevation saddle — some boards. */
  stones?: { center: Vector3; yaw: number; count: number }
  /** The printed scale bar on quiet ground, yawed to a seeded cardinal. */
  scaleBar?: { center: Vector3; yaw: number }
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
/** Standing stones deal on about a third of boards, on mid-elevation
 *  saddles — neither the drowned valleys nor the cairns' skylines. */
const STONES_CHANCE = 0.35
const STONES_MAX_SLOPE = 0.12
const STONES_BAND: readonly [number, number] = [0.42, 0.68]
/** Furniture keeps out of each other's scenes. */
const FURNITURE_SEPARATION = 18

export const pickScenerySites = (
  seed: string,
  path: TilePathResult,
  pond: PondSite | undefined,
  summit: SummitSite | undefined,
  sampler: HeightSampler,
  river?: RiverPath,
  lake?: LakeSite
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
    if (lake && lakeShoreDistance(lake, x, z) < 2 + margin) return false
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

  // Everything below draws AFTER the original picks on the same stream, so
  // shipped boards keep their cairns and compass byte-for-byte. Fixed draw
  // count regardless of outcome, so later features stay independent too.
  const stonesRoll = random()
  const stonesYaw = random() * Math.PI
  const stonesCount = 3 + Math.floor(random() * 3)
  const scaleBarYaw = random() < 0.5 ? 0 : Math.PI / 2

  const placedSoFar = (): Vector3[] => {
    const placed = [...cairns]
    if (compass) placed.push(compass)
    return placed
  }

  // Standing stones: a ring on a mid-elevation saddle, apart from the other
  // furniture — some boards, on a seeded roll.
  let stones: ScenerySites['stones']
  if (stonesRoll < STONES_CHANCE) {
    const low = MAX_ELEVATION * STONES_BAND[0]
    const high = MAX_ELEVATION * STONES_BAND[1]
    const saddle = spots
      .filter(spot => spot.slope <= STONES_MAX_SLOPE && spot.y >= low && spot.y <= high)
      .filter(spot =>
        placedSoFar().every(
          other => Math.hypot(other.x - spot.x, other.z - spot.z) > FURNITURE_SEPARATION
        )
      )
      .sort((a, b) => a.slope - b.slope)
    if (saddle.length) {
      const spot = saddle[0]
      stones = {
        center: new Vector3(spot.x, spot.y, spot.z),
        yaw: stonesYaw,
        count: stonesCount,
      }
    }
  }

  // Scale bar: the next-quietest ground — always dealt when a spot exists,
  // like the compass; the pair completes the printed-map margin furniture.
  const scaleSpot = quiet.find(spot => {
    const placed = placedSoFar()
    if (stones) placed.push(stones.center)
    return placed.every(
      other => Math.hypot(other.x - spot.x, other.z - spot.z) > FURNITURE_SEPARATION
    )
  })
  const scaleBar = scaleSpot
    ? { center: new Vector3(scaleSpot.x, scaleSpot.y, scaleSpot.z), yaw: scaleBarYaw }
    : undefined

  return { cairns, compass, stones, scaleBar }
}

/** A fingerpost stands just off the shelf edge, pointing the way ahead. */
export interface WaymarkSite {
  position: Vector3
  /** Heading of the pointing arm — the track's forward direction here. */
  yaw: number
}

/** Lateral berth off the track centerline (×spacing). Deliberately INSIDE
 *  the railway's 1.6×spacing exclusion band, so a post and a rail line can
 *  never meet without the railway knowing about waymarks at all. */
const WAYMARK_OFFSET = 1.1

/**
 * Fingerpost waymarkers at about ⅓ and ⅔ of the route: one post, ONE angled
 * arm pointing onward (a two-armed post is a crossbar silhouette). Purely
 * deterministic from the track's own shape — no RNG stream. A fraction whose
 * ground is claimed slides along the track a little, then gives up quietly.
 */
export const pickWaymarkSites = (
  path: TilePathResult,
  pond: PondSite | undefined,
  summit: SummitSite | undefined,
  river: RiverPath | undefined,
  furniture: ScenerySites,
  sampler: HeightSampler,
  lake?: LakeSite,
  town?: TownSite
): WaymarkSite[] => {
  const { shelfPoints, spacing } = path
  const sites: WaymarkSite[] = []

  const isOpen = (x: number, z: number): boolean => {
    if (Math.hypot(x, z) > EDGE_FADE_START - 2) return false
    if (pond && Math.hypot(pond.center.x - x, pond.center.z - z) < pond.basinRadius + 1)
      return false
    if (summit && Math.hypot(summit.center.x - x, summit.center.z - z) < summit.radius + 1)
      return false
    if (river) {
      for (const point of river.points) {
        if (Math.hypot(point.x - x, point.z - z) < river.width + 1.5) return false
      }
    }
    if (lake && lakeShoreDistance(lake, x, z) < 1.5) return false
    if (town && Math.hypot(town.center.x - x, town.center.z - z) < town.radius + 2) return false
    const others = [
      ...furniture.cairns,
      ...(furniture.compass ? [furniture.compass] : []),
      ...(furniture.stones ? [furniture.stones.center] : []),
      ...(furniture.scaleBar ? [furniture.scaleBar.center] : []),
      ...sites.map(site => site.position),
    ]
    return others.every(other => Math.hypot(other.x - x, other.z - z) > 10)
  }

  for (const fraction of [1 / 3, 2 / 3]) {
    const anchor = Math.round(fraction * (shelfPoints.length - 1))
    for (const slide of [0, 3, -3, 6, -6, 9, -9]) {
      const index = anchor + slide
      if (index < 2 || index > shelfPoints.length - 3) continue
      const previous = shelfPoints[index - 2]
      const here = shelfPoints[index]
      const next = shelfPoints[index + 2]
      const tangentX = next.x - previous.x
      const tangentZ = next.z - previous.z
      const magnitude = Math.hypot(tangentX, tangentZ) || 1
      // The outside of the local curve: the lateral normal pointing AWAY
      // from where the track bends, so the post never lands between passes.
      const bendX = previous.x + next.x - 2 * here.x
      const bendZ = previous.z + next.z - 2 * here.z
      let normalX = -tangentZ / magnitude
      let normalZ = tangentX / magnitude
      if (normalX * bendX + normalZ * bendZ > 0) {
        normalX = -normalX
        normalZ = -normalZ
      }
      const x = here.x + normalX * WAYMARK_OFFSET * spacing
      const z = here.z + normalZ * WAYMARK_OFFSET * spacing
      if (!isOpen(x, z)) continue
      // Every OTHER pass of the track stays further away than the post's own
      // stretch — otherwise the arm reads as signing the WRONG road.
      const ownStretch = 8
      const crowded = shelfPoints.some((point, dense) => {
        if (Math.abs(dense - index) <= ownStretch) return false
        return Math.hypot(point.x - x, point.z - z) < spacing * 1.3
      })
      if (crowded) continue
      sites.push({
        position: new Vector3(x, sampler(x, z), z),
        yaw: Math.atan2(tangentX, tangentZ),
      })
      break
    }
  }
  return sites
}
