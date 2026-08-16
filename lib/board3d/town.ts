import Alea from 'alea'
import { Vector3 } from 'three'
import type { HeightSampler } from './terrain'
import { EDGE_FADE_START, MAX_ELEVATION } from './terrain'
import type { TilePathResult } from './path'
import type { PondSite } from './water'
import type { RiverPath } from './river'
import type { SummitSite } from './summit'
import type { ScenerySites } from './scenery'
import { type LakeSite, lakeShoreDistance } from './lake'

/**
 * A hamlet: the landscape's first settlement — a huddle of 5–7 houses and
 * one tower around a short lane, dealt on any biome and dressed in its
 * palette by the builder (adobe in the desert, timber on the grassland,
 * whitewash on the ice). The same register as the steam train: a charming
 * miniature human world, purely visual. Placement only — geometry lives in
 * board-builder with the other mesh construction.
 */
export interface TownHouse {
  x: number
  z: number
  /** Ground under the house (final composed sampler). */
  y: number
  yaw: number
  scale: number
  kind: 'house' | 'tower'
}

export interface TownSite {
  center: Vector3
  /** Footprint claim — later pickers keep out of it. */
  radius: number
  houses: TownHouse[]
  /** The lane's polyline through the huddle (y = ground, draped later). */
  lane: Vector3[]
}

/** A dealt hamlet is a one-in-five-boards event — commoner than the train
 *  (houses are less structurally scarce than a fat clear contour), still a
 *  treat. Isaac set the rate. */
const TOWN_CHANCE = 0.4
/** Footprint (×spacing) — compact on purpose: a level 7-unit plot is a
 *  rarity on fBm ground, and the huddle reads tighter anyway. */
const TOWN_RADIUS = 1.35
/** Valleys only: the huddle sits between these elevations (world units).
 *  The fBm field rests around MAX_ELEVATION/2, so the cap sits just under
 *  the mean — low country, not only the deepest dells. */
const FLOOR_MIN = 0.4
const FLOOR_MAX = MAX_ELEVATION * 0.52
/** The whole plot must be near-level: height spread across its rings. Not
 *  billiard-flat — every house sits its own sampled ground, and a gently
 *  tilted huddle reads as a hillside village, which is charm, not error. */
const MAX_SPREAD = 1.15
/** Houses keep breathing room between each other (world units). */
const HOUSE_SEPARATION = 1.6
const SCAN_STEP = 4

export const pickTownSite = (
  seed: string,
  path: TilePathResult,
  pond: PondSite | undefined,
  summit: SummitSite | undefined,
  river: RiverPath | undefined,
  scenery: ScenerySites,
  sampler: HeightSampler,
  lake?: LakeSite
): TownSite | undefined => {
  const random = Alea(`${seed}:town`)
  if (random() >= TOWN_CHANCE) return undefined

  const { shelfPoints, spacing } = path
  const radius = TOWN_RADIUS * spacing
  const trackClearance = spacing * 1.6 + radius
  const trackClearanceSquared = trackClearance * trackClearance

  const centerIsOpen = (x: number, z: number): boolean => {
    if (Math.hypot(x, z) > EDGE_FADE_START - radius - 2) return false
    for (const point of shelfPoints) {
      const dx = point.x - x
      const dz = point.z - z
      if (dx * dx + dz * dz < trackClearanceSquared) return false
    }
    if (pond && Math.hypot(pond.center.x - x, pond.center.z - z) < pond.basinRadius + radius + 1)
      return false
    if (
      summit &&
      Math.hypot(summit.center.x - x, summit.center.z - z) <
        summit.radius + radius + spacing * 1.05
    )
      return false
    // Waterside is WELCOME — the huddle may stand close, its houses just
    // never in the water (per-house check below).
    if (river) {
      for (const point of river.points) {
        if (Math.hypot(point.x - x, point.z - z) < river.width + radius * 0.55) return false
      }
    }
    if (lake && lakeShoreDistance(lake, x, z) < radius * 0.55) return false
    const furniture = [
      ...scenery.cairns,
      ...(scenery.compass ? [scenery.compass] : []),
      ...(scenery.stones ? [scenery.stones.center] : []),
      ...(scenery.scaleBar ? [scenery.scaleBar.center] : []),
    ]
    return furniture.every(other => Math.hypot(other.x - x, other.z - z) > radius + 4)
  }

  const nearWater = (x: number, z: number): number => {
    let distance = Infinity
    if (river) {
      for (const point of river.points) {
        distance = Math.min(distance, Math.hypot(point.x - x, point.z - z))
      }
    }
    if (lake) distance = Math.min(distance, lakeShoreDistance(lake, x, z))
    if (pond)
      distance = Math.min(
        distance,
        Math.hypot(pond.center.x - x, pond.center.z - z) - pond.waterRadius
      )
    return distance
  }

  // Survey the valleys for level, open plots — best score wins, where flat
  // beats sloped and a waterside berth beats a dry one.
  const reach = EDGE_FADE_START - radius - 2
  const candidates: { x: number; z: number; y: number; score: number }[] = []
  for (let x = -reach; x <= reach; x += SCAN_STEP) {
    for (let z = -reach; z <= reach; z += SCAN_STEP) {
      const y = sampler(x, z)
      if (y < FLOOR_MIN || y > FLOOR_MAX) continue
      if (!centerIsOpen(x, z)) continue
      let low = y
      let high = y
      // Two rings: the footprint rim AND the ring the houses stand on.
      for (const ring of [radius, radius * 0.6]) {
        for (let arm = 0; arm < 8; arm++) {
          const angle = (arm * Math.PI) / 4
          const edge = sampler(x + Math.sin(angle) * ring, z + Math.cos(angle) * ring)
          low = Math.min(low, edge)
          high = Math.max(high, edge)
        }
      }
      const spread = high - low
      if (spread > MAX_SPREAD) continue
      const water = nearWater(x, z)
      const waterBonus = water === Infinity ? 0 : Math.max(0, 2.5 - water / 6)
      candidates.push({ x, z, y, score: waterBonus - spread * 2 })
    }
  }
  candidates.sort((a, b) => b.score - a.score)

  for (const plot of candidates.slice(0, 10)) {
    const houseCount = 5 + Math.floor(random() * 3)
    const towerIndex = Math.floor(random() * houseCount)
    const opening = random() * Math.PI * 2

    // The lane runs through the plot along the arc's opening.
    const laneDirection = opening + Math.PI / 2
    const lane: Vector3[] = []
    const laneHalf = radius * 0.8
    for (let step = 0; step <= 8; step++) {
      const along = -laneHalf + (laneHalf * 2 * step) / 8
      const x = plot.x + Math.sin(laneDirection) * along
      const z = plot.z + Math.cos(laneDirection) * along
      lane.push(new Vector3(x, sampler(x, z), z))
    }

    // Houses on a loose arc facing the lane: regular spacing over ~250°,
    // jittered, each on its own sampled ground.
    const houses: TownHouse[] = []
    const arcSpan = Math.PI * 1.4
    let placed = true
    for (let index = 0; index < houseCount; index++) {
      const angle =
        opening +
        Math.PI * 0.3 +
        (arcSpan * index) / (houseCount - 1) +
        (random() - 0.5) * 0.25
      const ring = radius * (0.5 + random() * 0.2)
      const x = plot.x + Math.sin(angle) * ring
      const z = plot.z + Math.cos(angle) * ring
      if (river) {
        const wet = river.points.some(
          point => Math.hypot(point.x - x, point.z - z) < river.width + 1.2
        )
        if (wet) {
          placed = false
          break
        }
      }
      if (lake && lakeShoreDistance(lake, x, z) < 1.2) {
        placed = false
        break
      }
      if (houses.some(other => Math.hypot(other.x - x, other.z - z) < HOUSE_SEPARATION)) {
        placed = false
        break
      }
      // Face the lane's nearest point, with a human wobble.
      let nearest = lane[0]
      for (const point of lane) {
        if (Math.hypot(point.x - x, point.z - z) < Math.hypot(nearest.x - x, nearest.z - z))
          nearest = point
      }
      houses.push({
        x,
        z,
        y: sampler(x, z),
        yaw: Math.atan2(nearest.x - x, nearest.z - z) + (random() - 0.5) * 0.3,
        scale: 0.8 + random() * 0.25,
        kind: index === towerIndex ? 'tower' : 'house',
      })
    }
    if (!placed) continue

    return {
      center: new Vector3(plot.x, plot.y, plot.z),
      radius,
      houses,
      lane,
    }
  }
  return undefined
}
