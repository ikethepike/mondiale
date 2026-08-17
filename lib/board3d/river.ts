import Alea from 'alea'
import { CatmullRomCurve3, Vector3 } from 'three'
import type { HeightSampler } from './terrain'
import { EDGE_FADE_START, smoothstep } from './terrain'
import type { Tile } from '~~/types/game.types'
import type { TilePathResult } from './path'
import { smoothPolyline } from './polyline'
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
export interface RiverCrossing {
  /** Mid-band point; y = the track shelf's height there (the deck's shore). */
  center: Vector3
  /** The TRACK's direction at the crossing — the deck runs along it. */
  tangent: Vector3
  /** Reach around the center where the carve narrows and shallows. */
  halfBand: number
}

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
  /** At most one bridged track crossing (v2 — v1 always stopped short). */
  crossings: RiverCrossing[]
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
/** The ROAD itself: the shelf band plus shoulders, the stretch the deck
 *  actually spans. Distinct from TRACK_CLEARANCE, the aesthetic berth a
 *  running stream keeps — neighbouring passes' berths merge over most of a
 *  serpentine's interior, and a crossing only needs to clear the road. */
const CROSSING_ROAD_BAND = 0.8
/** In-road walk budget (×spacing): one square road crossing plus slack. */
const CROSSING_MAX_SPAN = 2.1
/** Total crossing walk budget (×spacing): road plus the far shoulder the
 *  stream must fully clear before it may resume marching. */
const CROSSING_WALK_CAP = 5.5
/** How many bank-hugging strides a blocked stream may spend looking for its
 *  bridge before settling at the water's edge. */
const SLIDE_LIMIT = 10
/** The flanking track must be near-level (×spacing) — a deck over a slope
 *  reads broken. A touch looser than the pond's tolerance: this deck's arc
 *  dips toward both shores and forgives a little more. */
const CROSSING_LEVEL = 0.1

export const pickRiverPath = (
  seed: string,
  path: TilePathResult,
  pond: PondSite | undefined,
  summit: SummitSite | undefined,
  sampler: HeightSampler,
  tiles?: Tile[]
): RiverPath | undefined => {
  const random = Alea(`${seed}:river`)
  if (random() >= RIVER_CHANCE) return undefined

  const { shelfPoints, spacing, transforms } = path
  const clearance = TRACK_CLEARANCE * spacing
  const clearanceSquared = clearance * clearance

  // 'hard' ground the stream can never take; 'track' can be BRIDGED once,
  // when the geometry is right — that is the whole crossing feature.
  const blockedBy = (x: number, z: number): 'hard' | 'track' | undefined => {
    if (Math.hypot(x, z) > EDGE_FADE_START - 4) return 'hard'
    if (pond && Math.hypot(pond.center.x - x, pond.center.z - z) < pond.basinRadius + RIVER_WIDTH)
      return 'hard'
    if (
      summit &&
      Math.hypot(summit.center.x - x, summit.center.z - z) < summit.radius + RIVER_WIDTH
    )
      return 'hard'
    for (const point of shelfPoints) {
      const dx = point.x - x
      const dz = point.z - z
      if (dx * dx + dz * dz < clearanceSquared) return 'track'
    }
    return undefined
  }
  const isOpen = (x: number, z: number): boolean => blockedBy(x, z) === undefined

  const nearestShelfIndex = (x: number, z: number): number => {
    let nearest = Infinity
    let at = 0
    shelfPoints.forEach((point, index) => {
      const distance = (point.x - x) ** 2 + (point.z - z) ** 2
      if (distance < nearest) {
        nearest = distance
        at = index
      }
    })
    return at
  }

  const trackTangentAt = (x: number, z: number): Vector3 | undefined => {
    const anchor = nearestShelfIndex(x, z)
    const previous = shelfPoints[Math.max(anchor - 2, 0)]
    const next = shelfPoints[Math.min(anchor + 2, shelfPoints.length - 1)]
    const tangent = new Vector3(next.x - previous.x, 0, next.z - previous.z)
    if (tangent.lengthSq() < 1e-6) return undefined
    return tangent.normalize()
  }

  /** Try to take the stream straight across the track: square-on by
   *  construction (the walk snaps to the exact perpendicular, aimed at the
   *  road — rivers turn to meet their bridges square, and the coarse
   *  low-pass rounds the elbow), over near-level flanking track, spending
   *  no more than the road budget on the deck's ground, coming out into
   *  open country on the FAR side. */
  const tryCrossing = (
    fromX: number,
    fromZ: number
  ): { points: Vector3[]; exit: Vector3; crossing: RiverCrossing } | undefined => {
    const anchor = nearestShelfIndex(fromX, fromZ)
    const tangent = trackTangentAt(fromX, fromZ)
    if (!tangent) return undefined

    const shelf = shelfPoints[anchor]
    // The perpendicular, signed to point AT the road.
    const across = Math.sign((shelf.x - fromX) * -tangent.z + (shelf.z - fromZ) * tangent.x) || 1
    const headingX = -tangent.z * across
    const headingZ = tangent.x * across

    const flankA = shelfPoints[Math.max(anchor - 4, 0)]
    const flankB = shelfPoints[Math.min(anchor + 4, shelfPoints.length - 1)]
    if (Math.abs(flankA.y - flankB.y) > CROSSING_LEVEL * spacing) {
      return undefined
    }
    // The stream must arrive near the track's own height: a valley stream
    // meeting a hillside embankment would saw a gorge through the shelf.
    if (Math.abs(sampler(fromX, fromZ) - shelf.y) > 0.4) {
      return undefined
    }
    // The channel slips BETWEEN two tiles, never under one: mid-segment
    // only (clear of every disc rim, radius 0.42×spacing), and both
    // flanking tiles plain — a gate's marker overhangs its disc.
    for (let index = 0; index < transforms.length; index++) {
      const center = transforms[index].position
      const reach = Math.hypot(center.x - shelf.x, center.z - shelf.z)
      if (reach > spacing * 1.2) continue
      if (reach < spacing * 0.35) return undefined
      if (tiles && tiles[index].type !== 'normal') return undefined
    }

    // Which side we entered from: the sign of the lateral offset must FLIP
    // by the time we come out, or we only grazed the band and bounced.
    const sideOf = (x: number, z: number) =>
      Math.sign(tangent.x * (z - shelf.z) - tangent.z * (x - shelf.x))
    const entrySide = sideOf(fromX, fromZ)

    const stride = 0.9
    const roadBand = CROSSING_ROAD_BAND * spacing
    const roadBandSquared = roadBand * roadBand
    const onRoad = (x: number, z: number): boolean => {
      for (const point of shelfPoints) {
        const dx = point.x - x
        const dz = point.z - z
        if (dx * dx + dz * dz < roadBandSquared) return true
      }
      return false
    }

    // Three phases along the perpendicular: approach (berth ground before
    // the road), the road itself (short, budgeted), then the far shoulder —
    // which must open into genuinely clear country WITHOUT meeting a second
    // road (no deck ever bridges two passes).
    const roadBudget = CROSSING_MAX_SPAN * spacing
    const points: Vector3[] = []
    let x = fromX
    let z = fromZ
    let roadSpan = 0
    let firstRoad: Vector3 | undefined
    let openRun = 0
    for (let walk = 0; walk < Math.ceil((CROSSING_WALK_CAP * spacing) / stride); walk++) {
      x += headingX * stride
      z += headingZ * stride
      if (blockedBy(x, z) === 'hard') {
        return undefined
      }
      const road = onRoad(x, z)
      if (road) {
        if (openRun > 0) {
          return undefined
        }
        roadSpan += stride
        if (roadSpan > roadBudget) {
          return undefined
        }
        const point = new Vector3(x, sampler(x, z), z)
        firstRoad ??= point
        points.push(point)
        continue
      }
      points.push(new Vector3(x, sampler(x, z), z))
      if (!firstRoad) continue
      // Past the road: two clear strides on the FAR side finish the
      // crossing. The stream may still stand inside the aesthetic berth —
      // if the bank stops it a step later, it pools just beyond its bridge,
      // which is exactly how that looks on a survey map.
      openRun += stride
      if (openRun >= stride * 2) {
        if (sideOf(x, z) === entrySide) {
          return undefined
        }
        return {
          points,
          exit: new Vector3(x, 0, z),
          crossing: {
            // The guard band covers the WHOLE road corridor, not just the
            // deck — a full-depth carve at its ends undermined the shelf.
            center: new Vector3((firstRoad.x + x) / 2, shelf.y, (firstRoad.z + z) / 2),
            tangent,
            halfBand: spacing * 1.2,
          },
        }
      }
    }
    return undefined
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
    const crossings: RiverCrossing[] = []
    let slides = 0

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
      const fromX = position.x
      const fromZ = position.z
      position.x += Math.sin(heading) * MARCH_STEP
      position.z += Math.cos(heading) * MARCH_STEP

      const block = blockedBy(position.x, position.z)
      if (block === 'track') {
        if (!crossings.length) {
          const crossed = tryCrossing(fromX, fromZ)
          if (crossed) {
            march.push(...crossed.points)
            position.set(crossed.exit.x, 0, crossed.exit.z)
            momentum.set(Math.sin(heading), 0, Math.cos(heading))
            crossings.push(crossed.crossing)
            continue
          }
        }
        // No bridge HERE — hug the bank the way rivers run beside a road,
        // and try again where the geometry opens up. A stream that never
        // finds its bridge ends at the bank exactly as v1 did.
        if (slides < SLIDE_LIMIT) {
          slides++
          const tangent = trackTangentAt(fromX, fromZ)
          if (!tangent) break
          const sign = Math.sign(momentum.x * tangent.x + momentum.z * tangent.z) || 1
          position.set(
            fromX + tangent.x * sign * MARCH_STEP,
            0,
            fromZ + tangent.z * sign * MARCH_STEP
          )
          if (blockedBy(position.x, position.z)) break
          momentum.set(tangent.x * sign, 0, tangent.z * sign)
          const bankY = sampler(position.x, position.z)
          march.push(new Vector3(position.x, bankY, position.z))
          recentLevels.push(bankY)
          if (recentLevels.length > 7) recentLevels.shift()
          if (recentLevels.length === 7 && recentLevels[0] - bankY < 0.18) break
          continue
        }
        break
      }
      if (block) break
      // A stream fighting its own current — the heading near-reversing in
      // one stride — has nowhere honest to go: end it here rather than fold
      // the ribbon over itself.
      if (march.length >= 2) {
        const back = march[march.length - 2]
        const last = march[march.length - 1]
        const inHeading = Math.atan2(last.x - back.x, last.z - back.z)
        const outHeading = Math.atan2(position.x - last.x, position.z - last.z)
        let turn = Math.abs(outHeading - inHeading)
        if (turn > Math.PI) turn = 2 * Math.PI - turn
        if (turn > 1.6) break
      }
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

    // The crossing corridor is PINNED through every smoothing pass: the
    // underpass was walked exactly square, and letting the low-pass drag it
    // toward the bank elbows would skew the channel under the deck.
    const pinned = (point: Vector3): boolean =>
      crossings.some(
        crossing =>
          Math.hypot(point.x - crossing.center.x, point.z - crossing.center.z) < crossing.halfBand
      )

    // After any smoothing pass, a drifted point is PROJECTED back out of the
    // surveyed berth — smoothing keeps its gentle bends, the berth keeps its
    // guarantee, and neither erodes the other unboundedly.
    const holdTheBerth = (line: Vector3[]): void => {
      for (const point of line) {
        if (pinned(point)) continue
        let nearest = Infinity
        let anchorX = 0
        let anchorZ = 0
        for (const shelf of shelfPoints) {
          const distance = Math.hypot(shelf.x - point.x, shelf.z - point.z)
          if (distance < nearest) {
            nearest = distance
            anchorX = shelf.x
            anchorZ = shelf.z
          }
        }
        if (nearest >= clearance || nearest < 1e-6) continue
        const push = clearance / nearest
        point.x = anchorX + (point.x - anchorX) * push
        point.z = anchorZ + (point.z - anchorZ) * push
      }
    }

    // The march can turn hard where the downhill direction flips across a
    // gully — and the spline faithfully reproduces every hairpin. Iron the
    // coarse polyline first (ends pinned; y re-clamps below), so the fine
    // resample inherits a graded line the way the railway's cut-and-fill does.
    // Relaxation: smooth, project, and again — smoothing alone drifts into
    // the berth, projection alone kinks along it; alternated, the line
    // settles gently AGAINST the boundary.
    for (let pass = 0; pass < 3; pass++) {
      smoothPolyline(coarse, 1, 'xz', pinned)
      holdTheBerth(coarse)
    }

    // Fine resample through a spline, then re-clamp: the smooth centerline is
    // what keeps the bed carve and the foam shoreline from scalloping.
    const spline = new CatmullRomCurve3(coarse, false, 'centripetal')
    const fineCount = Math.max(coarse.length * 2, Math.ceil(spline.getLength() / 1.2))
    const points = spline.getSpacedPoints(fineCount)
    for (let pass = 0; pass < 3; pass++) {
      smoothPolyline(points, 1, 'xz', pinned)
      holdTheBerth(points)
    }
    let fineLevel = Infinity
    for (const point of points) {
      fineLevel = Math.min(fineLevel, point.y)
      point.y = fineLevel
    }

    return { points, falls, width: RIVER_WIDTH, crossings }
  }
  return undefined
}

/**
 * Carve the bed: within `width` of the centerline the terrain blends down to
 * just under the local water surface, smoothstep back to the bank — the
 * same nearest-point recipe as the path shelf, pointed downward.
 */
export const withRiverBed = (sampler: HeightSampler, river: RiverPath): HeightSampler => {
  const { points, width, crossings } = river
  // The blend runs a shoulder wider than the carve's nominal reach — the
  // tighter falloff cut a visible crease along rough bank stretches.
  const shoulder = width * 1.25
  return (x, z) => {
    const bank = sampler(x, z)
    // Near a bridged crossing the carve NARROWS and SHALLOWS: a tight
    // channel slips under the deck without undermining the shelf the tile
    // discs stand on either side.
    let crossingBlend = 0
    for (const crossing of crossings) {
      const reach = Math.hypot(crossing.center.x - x, crossing.center.z - z)
      // sqrt keeps the shallowing STRONG across the whole corridor instead
      // of fading linearly the moment it leaves the deck.
      if (reach < crossing.halfBand)
        crossingBlend = Math.max(crossingBlend, Math.sqrt(1 - reach / crossing.halfBand))
    }
    const localShoulder = shoulder * (1 - crossingBlend * 0.45)
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
    if (nearestSquared >= localShoulder * localShoulder) return bank
    const t = smoothstep(Math.sqrt(nearestSquared) / localShoulder)
    const drop = (BED_DROP - WATER_DROP) * (1 - crossingBlend * 0.5)
    let bed = Math.min(bank, waterY - drop)
    // Inside a crossing corridor the channel floor is ALSO clamped against
    // the shelf's own height — the level-flank and bank-height gates bound
    // the usual case, but a low upstream water level could still cut deep.
    for (const crossing of crossings) {
      const reach = Math.hypot(crossing.center.x - x, crossing.center.z - z)
      if (reach < crossing.halfBand) {
        const blend = Math.sqrt(1 - reach / crossing.halfBand)
        // ...but never above the water line — a clamp that dried the
        // channel would be worse than the cut it prevents.
        bed = Math.max(bed, Math.min(crossing.center.y - 0.95 + 0.25 * blend, waterY - 0.15))
      }
    }
    return bed * (1 - t) + bank * t
  }
}
