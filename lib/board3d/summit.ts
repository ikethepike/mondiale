import Alea from 'alea'
import { Vector3 } from 'three'
import { EDGE_FADE_START, type HeightSampler, MAX_ELEVATION, smoothstep } from './terrain'
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
  /** Bearing from the peak toward the final tile — the ascent gorge and the
   *  climb ladder both run up this face. */
  faceAngle: number
  /** Seeded phases for the spur-and-gully crags (3-lobe, 5-lobe). */
  cragPhases: [number, number]
  /** World-space pawn anchors: one gorge ledge per gauntlet stage, then the
   *  summit. */
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
 *  (the fBm hills top out at MAX_ELEVATION). High on purpose, twice over:
 *  snow keys on ABSOLUTE elevation while the flank rides ±half a hill of
 *  base noise, smearing the band outward — and a wide cap buried the whole
 *  sculpted peak under a smooth white dome. The shader's line-density fade
 *  owns the tight-ring moiré now, so the crown can stay small. */
const SNOWLINE_FRACTION = 0.9

/** Flat ground carved under each climb anchor (×spacing — pawn-scaled, wide
 *  enough that the terrace notches the contour rings visibly). */
const LEDGE_RADIUS_RATIO = 0.42
/** The carved shelf sits this far BELOW the anchor: the slab platform
 *  board-builder stands on each ledge rises exactly this proud of the ground,
 *  and the pawn stands on the slab's top face (the anchor itself). */
export const LEDGE_SLAB_INSET = 0.14

/** The peak may reach into the contour fade band (its far flank dissolving
 *  into the page is the aesthetic), but its center stays inside it. */
const MAX_CENTER_DISTANCE = EDGE_FADE_START - 7

/** How deep the 3-lobe spur/gully cut and the 5-lobe detail bite into the
 *  flank radius (inward only — the footprint never exceeds `radius`, so the
 *  site-pick clearance math is untouched). */
const CRAG_PRIMARY = 0.14
const CRAG_DETAIL = 0.06
/** Flank profile exponent: >1 pulls the flanks concave under a sharp peak —
 *  a mountain silhouette, not the dome the plain smoothstep gave. */
const PEAK_SHARPNESS = 1.65
/** The ascent gorge: how much of the flank height the notch removes, and its
 *  angular half-width around `faceAngle`. */
const GORGE_DEPTH = 0.78
const GORGE_HALF_RAD = 0.55

/**
 * The massif's height mask in [0, 1] — THE single shape source: terrain
 * displacement, ledge anchors and the snow band all read it, so sculpt and
 * climb cannot drift. Radially: a plateau-topped concave peak whose radius
 * crags with two seeded sine lobes (spurs and gullies wobble the contour
 * rings). Angularly: a gorge notched up the face toward the final tile —
 * the mortal's ascent runs between two ridge walls.
 */
const summitMask = (
  site: Pick<SummitSite, 'center' | 'radius' | 'plateauRadius' | 'faceAngle' | 'cragPhases'>,
  x: number,
  z: number
): number => {
  const dx = x - site.center.x
  const dz = z - site.center.z
  const distance = Math.hypot(dx, dz)
  const [phaseA, phaseB] = site.cragPhases

  // Shoulder peaks: two lower companions merged into the flanks OPPOSITE the
  // gorge face — a massif is a family of summits, not an upturned bowl.
  // Reach + radius stays under radius + spacing (the site-pick clearance
  // margin at the tightest shipped spacing), so a shoulder can NEVER touch
  // the track the site was cleared against.
  const backAngle = site.faceAngle + Math.PI
  let shoulders = 0
  for (const [swingOffset, heightRatio] of [
    [0.9 + (phaseA % 1) * 0.4, 0.5],
    [-1.1 - (phaseB % 1) * 0.4, 0.36],
  ]) {
    const cx = site.center.x + Math.sin(backAngle + swingOffset) * site.radius * 0.8
    const cz = site.center.z + Math.cos(backAngle + swingOffset) * site.radius * 0.8
    const d = Math.hypot(x - cx, z - cz)
    const shoulderRadius = site.radius * 0.42
    if (d < shoulderRadius) {
      shoulders = Math.max(
        shoulders,
        Math.pow(smoothstep((shoulderRadius - d) / shoulderRadius), 1.5) * heightRatio
      )
    }
  }

  if (distance >= site.radius) return shoulders

  const theta = Math.atan2(dx, dz)
  const cut =
    CRAG_PRIMARY * (0.5 + 0.5 * Math.sin(3 * theta + phaseA)) +
    CRAG_DETAIL * (0.5 + 0.5 * Math.sin(5 * theta + phaseB)) +
    0.035 * (0.5 + 0.5 * Math.sin(8 * theta + phaseA * 1.7))
  const craggedRadius = site.radius * (1 - cut)
  if (distance >= craggedRadius) return shoulders
  if (distance <= site.plateauRadius) return 1

  let profile = Math.pow(
    smoothstep((craggedRadius - distance) / (craggedRadius - site.plateauRadius)),
    PEAK_SHARPNESS
  )

  // The gorge cuts the outer flank on the approach bearing and heals toward
  // the plateau, so the summit stays whole and the notch funnels upward.
  const swing = Math.atan2(Math.sin(theta - site.faceAngle), Math.cos(theta - site.faceAngle))
  const gorge = Math.exp(-((swing / GORGE_HALF_RAD) * (swing / GORGE_HALF_RAD)))

  // Mid-flank crenellation: two incommensurate polar waves wobble the rings
  // the way real mountains do — masked to zero at the plateau, the base seam
  // and inside the gorge, so every clean surface stays clean.
  const flankMask = profile * (1 - profile) * 4 * (1 - gorge)
  profile +=
    (Math.sin(distance * 0.9 + theta * 4 + phaseB) * 0.045 +
      Math.sin(distance * 1.7 - theta * 6 + phaseA) * 0.025) *
    flankMask

  const outerness = smoothstep(
    Math.min(1, Math.max(0, (distance - site.plateauRadius) / (craggedRadius - site.plateauRadius)))
  )
  return Math.max(profile * (1 - GORGE_DEPTH * gorge * outerness), shoulders)
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
  // Drawn before the bearing search so consumption is fixed per seed.
  const cragPhases: [number, number] = [random() * 2 * Math.PI, random() * 2 * Math.PI]

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
      faceAngle: Math.atan2(final.position.x - center.x, final.position.z - center.z),
      cragPhases,
      climbAnchors: [],
    }
    site.climbAnchors = climbAnchorsFor(site, sampler, stages)
    return site
  }
  return undefined
}

/** One ledge per gauntlet stage UP THE GORGE toward the summit — a gentle
 *  zigzag inside the notch, the way a switchback trail climbs a gully.
 *  Elevations come from the same mask `withSummitMassif` renders, so carve
 *  and climb cannot drift; the ladder is forced non-decreasing so a cleared
 *  stage always reads as ground gained. */
const climbAnchorsFor = (site: SummitSite, sampler: HeightSampler, stages: number): Vector3[] => {
  const flanks = Math.max(1, stages)
  const anchors: Vector3[] = []
  let floor = -Infinity

  for (let step = 0; step < flanks; step++) {
    const t = flanks === 1 ? 0.5 : step / (flanks - 1)
    // A tight stair on one bearing up the gorge floor — the wide zigzag
    // scattered the slabs across the face, where they read as loose blobs
    // instead of a ladder (Isaac's screenshot).
    const zigzag = site.faceAngle + (step % 2 === 0 ? -0.05 : 0.05)
    const reach = site.radius * 0.88 + (site.plateauRadius * 1.1 - site.radius * 0.88) * t
    const x = site.center.x + Math.sin(zigzag) * reach
    const z = site.center.z + Math.cos(zigzag) * reach
    const y = sampler(x, z) + site.height * summitMask(site, x, z)
    // Base-noise bumps must never let a gorge ledge out-climb the summit:
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
export const withSummitMassif = (
  sampler: HeightSampler,
  site: SummitSite,
  spacing: number
): HeightSampler => {
  const ledgeRadius = LEDGE_RADIUS_RATIO * spacing
  return (x, z) => {
    let y = sampler(x, z) + site.height * summitMask(site, x, z)
    site.climbAnchors.forEach((anchor, index) => {
      const distance = Math.hypot(x - anchor.x, z - anchor.z)
      if (distance >= ledgeRadius) return
      // Flank shelves sit a slab-inset below their anchor (the slab platform
      // tops out AT the anchor); the summit plateau pins exactly — a pawn
      // stands on the mountain itself there.
      const inset = index === site.climbAnchors.length - 1 ? 0 : LEDGE_SLAB_INSET
      const t = smoothstep(distance / ledgeRadius)
      y = (anchor.y - inset) * (1 - t) + y * t
    })
    return y
  }
}

/**
 * Where a climbing pawn stands after clearing `cleared` of `total` gauntlet
 * stages: one ledge per stage when the deal is full-length, a proportional
 * ledge when a thin board dealt fewer, and the summit at `cleared >= total`
 * (victory). World space — TopoScene copies it straight onto the pawn.
 */
export const summitClimbIndex = (
  site: SummitSite,
  cleared: number,
  total: number
): number | undefined => {
  if (cleared <= 0 || total <= 0) return undefined
  const flankCount = site.climbAnchors.length - 1
  return cleared >= total
    ? flankCount
    : Math.min(flankCount - 1, Math.ceil((cleared / total) * flankCount) - 1)
}

export const summitClimbAnchor = (
  site: SummitSite,
  cleared: number,
  total: number
): Vector3 | undefined => {
  const index = summitClimbIndex(site, cleared, total)
  return index === undefined ? undefined : site.climbAnchors[index].clone()
}
