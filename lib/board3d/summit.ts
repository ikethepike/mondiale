import Alea from 'alea'
import { Vector3 } from 'three'
import {
  EDGE_FADE_START,
  type HeightSampler,
  MAX_ELEVATION,
  smoothstep,
} from './terrain'
import type { TilePathResult } from './path'
import type { PondSite } from './water'

/**
 * The finale massif: a real TERRAIN mountain rising beyond the final tile,
 * drawn by the contour shader as concentric topo rings with a snowcapped
 * summit. The TRACK never touches it — level tile discs fail above ~1.3
 * world units of per-tile rise, so the mountain is scenery the GAUNTLET
 * climbs: one carved flank ledge per stage, then the summit plateau, each a
 * locally-flattened shelf a pawn stands on. TopoScene moves a challenger's
 * pawn up `climbAnchors` as stages clear; the summit is the victory stand.
 */
export interface SummitSite {
  /** XZ center of the peak; `y` is the summit plateau's world elevation. */
  center: Vector3
  /** Full flank reach in world units — the mask is zero beyond this. */
  radius: number
  /** Peak rise above the base terrain at the center. */
  height: number
  plateauRadius: number
  /** Contour lines fade into the snowcap wash above this world elevation. */
  snowlineY: number
  /** World-space pawn anchors: one flank ledge per gauntlet stage (facing the
   *  final tile, so the room watches the climb), then the summit. */
  climbAnchors: Vector3[]
}

/** A finale massif is a treat like the pond, not a fixture — and boards whose
 *  final tile has no open ground behind it (a spiral's center finish above
 *  all) decline one regardless of the roll. */
const SUMMIT_CHANCE = 0.55

/** World units, deliberately NOT spacing-scaled: the massif is scenery, and
 *  its flank slope (height / (radius − plateau)) is what the contour shader
 *  renders — at these numbers the ring-to-ring gap stays above the terrain's
 *  vertex pitch (0.87), which is what keeps the rings from moiréing. */
const SUMMIT_RADIUS = 20
const SUMMIT_HEIGHT = MAX_ELEVATION * 1.8
const PLATEAU_RADIUS = 5
/** Snow takes over at this fraction of the rise — only the massif crosses it
 *  (the fBm hills top out at MAX_ELEVATION). */
const SNOWLINE_FRACTION = 0.62

/** Flat ground carved under each climb anchor (×spacing — pawn-scaled). */
const LEDGE_RADIUS_RATIO = 0.3

/** The peak may reach into the contour fade band (its far flank dissolving
 *  into the page is the aesthetic), but its center stays inside it. */
const MAX_CENTER_DISTANCE = EDGE_FADE_START - 7

const summitMask = (site: Pick<SummitSite, 'center' | 'radius' | 'plateauRadius'>, x: number, z: number): number => {
  const distance = Math.hypot(x - site.center.x, z - site.center.z)
  if (distance >= site.radius) return 0
  if (distance <= site.plateauRadius) return 1
  return smoothstep((site.radius - distance) / (site.radius - site.plateauRadius))
}

/**
 * Pick where the finale massif stands, or undefined: seeded chance, then the
 * first bearing behind the final tile with open ground — the flank must clear
 * every track shelf point (the path shelf and the massif never fight, so
 * track elevation and chords stay untouched), stay inside the page, and keep
 * out of the pond's basin. `sampler` is the base terrain (pre-shelf — the
 * flank is clear of shelf influence by construction), used to resolve the
 * climb anchors' world elevations at build time.
 */
export const pickSummitSite = (
  seed: string,
  path: TilePathResult,
  pond: PondSite | undefined,
  sampler: HeightSampler,
  stages: number
): SummitSite | undefined => {
  const random = Alea(`${seed}:summit`)
  if (random() >= SUMMIT_CHANCE) return undefined

  const { transforms, shelfPoints, spacing } = path
  const final = transforms[transforms.length - 1]
  const clearance = SUMMIT_RADIUS + spacing * 1.05
  const centerDistance = SUMMIT_RADIUS + spacing * 1.15

  // Bearings fan out from "directly behind the final tile", where behind
  // means outward from the board's heart — the annulus between the track's
  // footprint and the page edge is where a 20-unit flank can actually fit.
  const outward = new Vector3(final.position.x, 0, final.position.z)
  const direction = outward.length() > 8 ? outward.normalize() : final.tangent.clone()
  const base = Math.atan2(direction.x, direction.z)

  for (const offset of [0, 0.45, -0.45, 0.9, -0.9]) {
    const bearing = base + offset
    const center = new Vector3(
      final.position.x + Math.sin(bearing) * centerDistance,
      0,
      final.position.z + Math.cos(bearing) * centerDistance
    )
    if (Math.hypot(center.x, center.z) > MAX_CENTER_DISTANCE) continue

    const clearanceSquared = clearance * clearance
    const clear = shelfPoints.every(point => {
      const dx = point.x - center.x
      const dz = point.z - center.z
      return dx * dx + dz * dz >= clearanceSquared
    })
    if (!clear) continue

    if (pond) {
      const pondGap = SUMMIT_RADIUS + pond.basinRadius
      const dx = pond.center.x - center.x
      const dz = pond.center.z - center.z
      if (dx * dx + dz * dz < pondGap * pondGap) continue
    }

    const baseY = sampler(center.x, center.z)
    const site: SummitSite = {
      center: new Vector3(center.x, baseY + SUMMIT_HEIGHT, center.z),
      radius: SUMMIT_RADIUS,
      height: SUMMIT_HEIGHT,
      plateauRadius: PLATEAU_RADIUS,
      snowlineY: baseY + SUMMIT_HEIGHT * SNOWLINE_FRACTION,
      climbAnchors: [],
    }
    site.climbAnchors = climbAnchorsFor(site, final.position, sampler, stages)
    return site
  }
  return undefined
}

/** One ledge per gauntlet stage up the flank FACING the final tile, then the
 *  summit. Elevations come from the same math `withSummitMassif` renders, so
 *  carve and climb cannot drift; the ladder is forced non-decreasing so a
 *  cleared stage always reads as ground gained. */
const climbAnchorsFor = (
  site: SummitSite,
  finalTile: Vector3,
  sampler: HeightSampler,
  stages: number
): Vector3[] => {
  const faceAngle = Math.atan2(finalTile.x - site.center.x, finalTile.z - site.center.z)
  const flanks = Math.max(1, stages)
  const anchors: Vector3[] = []
  let floor = -Infinity

  for (let step = 0; step < flanks; step++) {
    const t = flanks === 1 ? 0.5 : step / (flanks - 1)
    // Sweep across the near face while climbing from low flank to plateau rim.
    const angle = faceAngle + (-0.55 + 1.1 * t)
    const reach = site.radius * 0.82 + (site.plateauRadius * 1.15 - site.radius * 0.82) * t
    const x = site.center.x + Math.sin(angle) * reach
    const z = site.center.z + Math.cos(angle) * reach
    const y = sampler(x, z) + site.height * summitMask(site, x, z)
    // Base-noise bumps must never let a flank ledge out-climb the summit:
    // each stays under it by a margin that shrinks toward the top.
    const ceiling = site.center.y - 0.8 * (flanks - step)
    floor = Math.min(Math.max(floor + 0.6, y), ceiling)
    anchors.push(new Vector3(x, floor, z))
  }

  anchors.push(new Vector3(site.center.x, site.center.y, site.center.z))
  return anchors
}

/**
 * Compose the massif into the height field: the peak's smoothstep profile on
 * top of the base terrain, then a flat shelf carved under each climb anchor.
 */
export const withSummitMassif = (sampler: HeightSampler, site: SummitSite, spacing: number): HeightSampler => {
  const ledgeRadius = LEDGE_RADIUS_RATIO * spacing
  return (x, z) => {
    let y = sampler(x, z) + site.height * summitMask(site, x, z)
    for (const anchor of site.climbAnchors) {
      const distance = Math.hypot(x - anchor.x, z - anchor.z)
      if (distance >= ledgeRadius) continue
      const t = smoothstep(distance / ledgeRadius)
      y = anchor.y * (1 - t) + y * t
    }
    return y
  }
}

/**
 * Where a climbing pawn stands after clearing `cleared` of `total` gauntlet
 * stages: one ledge per stage when the deal is full-length, a proportional
 * ledge when a thin board dealt fewer, and the summit at `cleared >= total`
 * (victory). World space — TopoScene copies it straight onto the pawn.
 */
export const summitClimbAnchor = (
  site: SummitSite,
  cleared: number,
  total: number
): Vector3 | undefined => {
  if (cleared <= 0 || total <= 0) return undefined
  const anchors = site.climbAnchors
  const flankCount = anchors.length - 1
  const ledge =
    cleared >= total
      ? anchors[anchors.length - 1]
      : anchors[Math.min(flankCount - 1, Math.ceil((cleared / total) * flankCount) - 1)]
  return ledge.clone()
}
