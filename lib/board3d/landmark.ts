import Alea from 'alea'
import { Vector3 } from 'three'
import { sample } from '~~/lib/arrays'
import type { HeightSampler } from './terrain'
import { EDGE_FADE_START } from './terrain'
import type { TilePathResult } from './path'
import type { PondSite } from './water'
import type { RiverPath } from './river'
import type { SummitSite } from './summit'
import type { TownSite } from './town'
import { type LakeSite, lakeShoreDistance } from './lake'

/**
 * A world-famous monument standing in miniature on open ground — a rare
 * board treat, purely visual. Placement only — geometry lives in
 * board-builder with the other mesh construction.
 */
export const LANDMARK_KINDS = [
  'eiffelTower',
  'whiteHouse',
  'motherland',
  'tajMahal',
  'colosseum',
  'stockholmCityHall',
  'berlinTvTower',
  'machuPicchu',
  'gizaPyramids',
  'bigBen',
  'sydneyOperaHouse',
  'moai',
] as const

export type LandmarkKind = (typeof LANDMARK_KINDS)[number]

export interface LandmarkSite {
  kind: LandmarkKind
  center: Vector3
  /** Footprint claim — later pickers keep out of it. */
  radius: number
  /** The monument's front faces the nearest stretch of track. */
  yaw: number
}

export interface LandmarkObstacles {
  pond?: PondSite
  summit?: SummitSite
  river?: RiverPath
  lake?: LakeSite
  town?: TownSite
  railway?: Vector3[]
  /** Standing furniture: cairns, stones, waymarks, the boat. */
  furniture: Vector3[]
}

const LANDMARK_CHANCE = 0.2
/** Footprint (world units — the monuments are built at house scale). */
const LANDMARK_RADIUS = 2.6
/** Height spread tolerated across the footprint (world units). */
const MAX_SPREAD = 0.9
const SCAN_STEP = 3

export const pickLandmarkSite = (
  seed: string,
  path: TilePathResult,
  sampler: HeightSampler,
  obstacles: LandmarkObstacles
): LandmarkSite | undefined => {
  const random = Alea(`${seed}:landmark`)
  if (random() >= LANDMARK_CHANCE) return undefined
  const kind = sample(LANDMARK_KINDS, random) ?? LANDMARK_KINDS[0]

  const { pond, summit, river, lake, town, railway, furniture } = obstacles
  const { shelfPoints, spacing } = path
  const radius = LANDMARK_RADIUS
  const trackClearance = spacing * 1.6 + radius

  const isOpen = (x: number, z: number): boolean => {
    if (pond && Math.hypot(pond.center.x - x, pond.center.z - z) < pond.basinRadius + radius + 1)
      return false
    if (
      summit &&
      Math.hypot(summit.center.x - x, summit.center.z - z) < summit.radius + radius + spacing
    )
      return false
    if (river) {
      for (const point of river.points) {
        if (Math.hypot(point.x - x, point.z - z) < river.width + radius + 1) return false
      }
    }
    if (lake && lakeShoreDistance(lake, x, z) < radius + 1) return false
    if (town && Math.hypot(town.center.x - x, town.center.z - z) < town.radius + radius + 2)
      return false
    if (railway) {
      for (const point of railway) {
        if (Math.hypot(point.x - x, point.z - z) < radius + 2.6) return false
      }
    }
    return furniture.every(other => Math.hypot(other.x - x, other.z - z) > radius + 3)
  }

  // Level, open plots near enough the track that the pawns pass it by.
  const reach = EDGE_FADE_START - radius - 2
  let best: { x: number; z: number; y: number; score: number; nearest: Vector3 } | undefined
  for (let x = -reach; x <= reach; x += SCAN_STEP) {
    for (let z = -reach; z <= reach; z += SCAN_STEP) {
      if (Math.hypot(x, z) > reach) continue
      let trackDistance = Infinity
      let nearest = shelfPoints[0]
      for (const point of shelfPoints) {
        const distance = Math.hypot(point.x - x, point.z - z)
        if (distance < trackDistance) {
          trackDistance = distance
          nearest = point
        }
      }
      if (trackDistance < trackClearance) continue
      if (!isOpen(x, z)) continue
      const y = sampler(x, z)
      let low = y
      let high = y
      for (const ring of [radius, radius * 0.55]) {
        for (let arm = 0; arm < 8; arm++) {
          const angle = (arm * Math.PI) / 4
          const edge = sampler(x + Math.sin(angle) * ring, z + Math.cos(angle) * ring)
          low = Math.min(low, edge)
          high = Math.max(high, edge)
        }
      }
      const spread = high - low
      if (spread > MAX_SPREAD) continue
      const score = -spread * 2 - (trackDistance - trackClearance) / spacing
      if (!best || score > best.score) best = { x, z, y, score, nearest }
    }
  }
  if (!best) return undefined

  return {
    kind,
    center: new Vector3(best.x, best.y, best.z),
    radius,
    yaw: Math.atan2(best.nearest.x - best.x, best.nearest.z - best.z),
  }
}
