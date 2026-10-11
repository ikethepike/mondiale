import {
  BoxGeometry,
  type BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'
import { BOARD_COLORS } from './colors'
import type { LandmarkKind, LandmarkSite } from './landmark'
import { faceted, type MarkerPart } from './parts'

/**
 * The monuments' geometry. Local space: y up, +z facing the track, origin on
 * the plinth top. Solids either nest or abut — a part half-poking through
 * another shows its ink hull as a gash, so overlaps are planned, not tolerated.
 */

type Point = [number, number, number]

/** How far a plinth stands proud of the highest ground under it. */
const PLINTH_LIFT = 0.22
/** The inked slab's underside — an ink width clear of the highest ground. */
const SLAB_BOTTOM = 0.15
/** How far below the lowest ground every footing reaches. */
const FOOTING = 0.3

const hull = (points: Point[]): BufferGeometry =>
  new ConvexGeometry(points.map(([x, y, z]) => new Vector3(x, y, z)))

/** A square frustum by its half-widths — legs, spires, piers. */
const frustum = (
  bottomHalf: number,
  topHalf: number,
  bottom: number,
  top: number,
  x = 0,
  z = 0,
  topX = x,
  topZ = z
): BufferGeometry => {
  const points: Point[] = []
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    points.push([x + sx * bottomHalf, bottom, z + sz * bottomHalf])
    if (topHalf > 0) points.push([topX + sx * topHalf, top, topZ + sz * topHalf])
  }
  if (topHalf <= 0) points.push([topX, top, topZ])
  return hull(points)
}

const box = (width: number, height: number, depth: number, x = 0, y = 0, z = 0) => {
  const geometry = new BoxGeometry(width, height, depth)
  geometry.translate(x, y + height / 2, z)
  return geometry
}

/** A round (or n-gon) drum standing on `y`. */
const drum = (
  bottomRadius: number,
  topRadius: number,
  height: number,
  segments: number,
  x = 0,
  y = 0,
  z = 0
) => {
  const geometry = new CylinderGeometry(topRadius, bottomRadius, height, segments)
  geometry.translate(x, y + height / 2, z)
  return faceted(geometry)
}

/** A thin disc facing +z, centred on the origin. */
const plaque = (radius: number, thickness: number, segments: number) => {
  const geometry = new CylinderGeometry(radius, radius, thickness, segments)
  geometry.rotateX(Math.PI / 2)
  return geometry
}

/** A round beam between two points — arms, booms, cables. */
const strut = (from: Vector3, to: Vector3, radius: number, segments = 6): BufferGeometry => {
  const direction = to.clone().sub(from)
  const beam = new CylinderGeometry(radius, radius, direction.length(), segments)
  beam.applyQuaternion(
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize())
  )
  const middle = from.clone().add(to).multiplyScalar(0.5)
  beam.translate(middle.x, middle.y, middle.z)
  return faceted(beam)
}

/** An onion dome: drum-width foot, swelling belly, drawn to a point. */
const onionDome = (radius: number, height: number, x = 0, y = 0, z = 0) => {
  const profile = [
    [0, 0],
    [radius * 0.9, 0],
    [radius * 1.12, height * 0.28],
    [radius, height * 0.5],
    [radius * 0.55, height * 0.75],
    [radius * 0.14, height * 0.92],
    [0, height],
  ].map(([px, py]) => new Vector2(px, py))
  const dome = new LatheGeometry(profile, 8)
  dome.translate(x, y, z)
  return dome
}

/** A square pyramid as two tetrahedra split corner to corner, so the toon
 *  ramp's flat ambient can't erase the ridges: the -x/-z flanks wear shade. */
const pyramidParts = (width: number, height: number, x: number, z: number): MarkerPart[] => {
  const half = width / 2
  const apex: Point = [x, height, z]
  const corner = (cx: number, cz: number): Point => [x + cx * half, -0.05, z + cz * half]
  return [
    {
      geometry: hull([apex, corner(-1, 1), corner(1, 1), corner(1, -1)]),
      color: BOARD_COLORS.warmSand,
    },
    {
      geometry: hull([apex, corner(-1, 1), corner(-1, -1), corner(1, -1)]),
      color: BOARD_COLORS.duneShade,
    },
  ]
}

/** A small crown: a band with three points — the Tre Kronor's unit. */
const crownParts = (x: number, y: number, z: number, size: number): BufferGeometry[] => {
  const band = drum(size * 0.8, size, size * 0.7, 8, x, y, z)
  const points = [0, 1, 2].map(index => {
    const angle = (index * Math.PI * 2) / 3
    const px = x + Math.sin(angle) * size * 0.65
    const pz = z + Math.cos(angle) * size * 0.65
    return frustum(size * 0.2, 0, y + size * 0.6, y + size * 1.25, px, pz)
  })
  return [band, ...points]
}

/** A terraced mound as ONE sloped solid with un-inked belts marking the
 *  steps: stacked step blocks each draw their own corner ink, a sawtooth. */
const terracedMound = (
  bottom: [number, number, number, number],
  top: [number, number, number, number],
  height: number,
  steps: number,
  body: string,
  belt: string
): MarkerPart[] => {
  const rect = (
    [x0, x1, z0, z1]: [number, number, number, number],
    y: number,
    grow = 0
  ): Point[] => [
    [x0 - grow, y, z0 - grow],
    [x1 + grow, y, z0 - grow],
    [x1 + grow, y, z1 + grow],
    [x0 - grow, y, z1 + grow],
  ]
  const at = (t: number): [number, number, number, number] =>
    bottom.map((value, index) => value + (top[index] - value) * t) as [
      number,
      number,
      number,
      number,
    ]
  const parts: MarkerPart[] = [
    { geometry: hull([...rect(bottom, -0.05), ...rect(top, height)]), color: body },
  ]
  for (let step = 1; step < steps; step++) {
    const t = step / steps
    const lower = at(t - 0.03)
    const upper = at(t + 0.03)
    parts.push({
      geometry: hull([
        ...rect(lower, height * (t - 0.03), 0.012),
        ...rect(upper, height * (t + 0.03), 0.012),
      ]),
      color: belt,
      outline: false,
    })
  }
  return parts
}

interface Plinth {
  width: number
  depth: number
  round?: boolean
  color: string
  x?: number
  z?: number
  /** The slab's top in site space, when a low drum of the monument IS the
   *  plinth. A low drum standing on a slab loses its side ink: the inverted
   *  hull's far wall drops below the slab top in the camera's eye. */
  height?: number
}

interface LandmarkModel {
  /** Every monument stands on a level plinth: anything inked that met the
   *  terrain itself was cut by it, ink and all. */
  plinth: Plinth
  parts: () => MarkerPart[]
}

const MODELS: Record<LandmarkKind, LandmarkModel> = {
  eiffelTower: {
    plinth: { width: 2.5, depth: 2.5, color: BOARD_COLORS.sourMilk },
    parts: () => {
      const iron = BOARD_COLORS.darkBlue
      const parts: MarkerPart[] = []
      const LEG_TOP = 1.45
      const legCentre = (y: number) => 0.8 - 0.5 * (y / LEG_TOP)
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          parts.push({
            geometry: frustum(
              0.16,
              0.08,
              0,
              LEG_TOP,
              sx * legCentre(0),
              sz * legCentre(0),
              sx * legCentre(LEG_TOP),
              sz * legCentre(LEG_TOP)
            ),
            color: iron,
          })
        }
      }
      // Each arch lies in its face's lean, its ends buried in the legs.
      const ARCH_FOOT = 0.32
      for (let side = 0; side < 4; side++) {
        const arch = new TorusGeometry(legCentre(ARCH_FOOT), 0.045, 4, 10, Math.PI)
        arch.rotateX(-Math.atan(0.5 / LEG_TOP))
        arch.translate(0, ARCH_FOOT, legCentre(ARCH_FOOT))
        arch.rotateY((side * Math.PI) / 2)
        parts.push({ geometry: arch, color: iron })
      }
      parts.push({ geometry: box(1.12, 0.12, 1.12, 0, 1.4), color: BOARD_COLORS.warmSand })
      parts.push({ geometry: frustum(0.32, 0.15, 1.5, 2.72), color: iron })
      parts.push({ geometry: box(0.52, 0.09, 0.52, 0, 2.68), color: BOARD_COLORS.warmSand })
      parts.push({ geometry: frustum(0.14, 0, 2.75, 4.25), color: iron })
      parts.push({ geometry: drum(0.025, 0.02, 0.4, 5, 0, 4.1), color: BOARD_COLORS.hiorAnge })
      return parts
    },
  },

  colosseum: {
    plinth: { width: 3.7, depth: 3.1, round: true, color: BOARD_COLORS.sourMilk },
    parts: () => {
      const stone = BOARD_COLORS.warmSand
      const parts: MarkerPart[] = []
      const ellipse = (radius: number) => {
        const shape = new Shape()
        shape.absellipse(0, 0, radius, radius * 0.8, 0, Math.PI * 2, false, 0)
        return shape
      }
      const ring = ellipse(1.6)
      ring.holes.push(ellipse(1.15))
      const lower = new ExtrudeGeometry(ring, {
        depth: 0.8,
        bevelEnabled: false,
        curveSegments: 20,
      })
      lower.rotateX(-Math.PI / 2)
      lower.translate(0, -0.05, 0)
      parts.push({ geometry: lower, color: stone })
      const arc = new Shape()
      arc.absellipse(0, 0, 1.6, 1.28, Math.PI * 0.85, Math.PI * 2.15, false, 0)
      arc.absellipse(0, 0, 1.38, 1.1, Math.PI * 2.15, Math.PI * 0.85, true, 0)
      const upper = new ExtrudeGeometry(arc, {
        depth: 0.45,
        bevelEnabled: false,
        curveSegments: 16,
      })
      upper.rotateX(-Math.PI / 2)
      upper.translate(0, 0.74, 0)
      parts.push({ geometry: upper, color: stone })
      const arena = new CircleGeometry(1.15, 20)
      arena.rotateX(-Math.PI / 2)
      arena.scale(1, 1, 0.8)
      arena.translate(0, 0.02, 0)
      parts.push({ geometry: arena, color: BOARD_COLORS.duneShade, outline: false })
      const ARCHES = 20
      for (let index = 0; index < ARCHES; index++) {
        const angle = (index / ARCHES) * Math.PI * 2
        const turns = angle / Math.PI
        const rows = turns > 0.85 || turns < 0.15 ? [0.12, 0.45, 0.85] : [0.12, 0.45]
        for (const lift of rows) {
          const window = new BoxGeometry(0.16, 0.2, 0.04)
          window.rotateY(Math.atan2(Math.cos(angle) / 1.6, -Math.sin(angle) / 1.28))
          window.translate(Math.cos(angle) * 1.6, lift + 0.1, -Math.sin(angle) * 1.28)
          parts.push({ geometry: window, color: BOARD_COLORS.darkBlue, outline: false })
        }
      }
      return parts
    },
  },

  bigBen: {
    plinth: { width: 1.1, depth: 1.1, color: BOARD_COLORS.sourMilk },
    parts: () => {
      const stone = BOARD_COLORS.warmSand
      const gold = BOARD_COLORS.warmSand
      const parts: MarkerPart[] = []
      parts.push({ geometry: box(0.56, 2.05, 0.56, 0, 0), color: stone })
      parts.push({ geometry: box(0.74, 0.64, 0.74, 0, 2.0), color: stone })
      const CLOCK_Y = 2.32
      for (let side = 0; side < 4; side++) {
        const turn = (side * Math.PI) / 2
        const place = (geometry: BufferGeometry, out: number) => {
          geometry.translate(0, 0, out)
          geometry.rotateY(turn)
          geometry.translate(0, CLOCK_Y, 0)
          return geometry
        }
        parts.push({ geometry: place(plaque(0.29, 0.03, 12), 0.37), color: BOARD_COLORS.darkBlue })
        parts.push({ geometry: place(plaque(0.24, 0.03, 12), 0.385), color: BOARD_COLORS.sourMilk })
        for (const [length, width, angle] of [
          [0.14, 0.035, Math.PI * 0.35],
          [0.2, 0.025, -Math.PI * 0.12],
        ]) {
          const hand = new BoxGeometry(width, length, 0.01)
          hand.translate(0, length / 2 - 0.02, 0)
          hand.rotateZ(angle)
          parts.push({
            geometry: place(hand, 0.405),
            color: BOARD_COLORS.darkBlue,
            outline: false,
          })
        }
      }
      parts.push({ geometry: box(0.6, 0.42, 0.6, 0, 2.64), color: stone })
      for (let side = 0; side < 4; side++) {
        for (const offset of [-0.13, 0.13]) {
          const opening = new BoxGeometry(0.1, 0.24, 0.02)
          opening.translate(offset, 2.75 + 0.12, 0.305)
          opening.rotateY((side * Math.PI) / 2)
          parts.push({ geometry: opening, color: BOARD_COLORS.darkBlue, outline: false })
        }
      }
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          parts.push({ geometry: frustum(0.035, 0, 2.62, 2.95, sx * 0.33, sz * 0.33), color: gold })
        }
      }
      parts.push({ geometry: frustum(0.31, 0, 3.04, 4.2), color: BOARD_COLORS.darkBlue })
      parts.push({ geometry: drum(0.025, 0.012, 0.35, 5, 0, 4.1), color: gold })
      return parts
    },
  },

  stockholmCityHall: {
    plinth: { width: 3.5, depth: 1.75, x: 0.12, z: -0.06, color: BOARD_COLORS.sourMilk },
    parts: () => {
      const brick = BOARD_COLORS.hiorAnge
      const copper = BOARD_COLORS.softMint
      const gold = BOARD_COLORS.warmSand
      const parts: MarkerPart[] = []
      parts.push({ geometry: box(2.6, 0.8, 1.3, 0.25, -0.05, -0.1), color: brick })
      parts.push({
        geometry: hull([
          [-1.06, 0.74, -0.76],
          [1.56, 0.74, -0.76],
          [1.56, 0.74, 0.56],
          [-1.06, 0.74, 0.56],
          [-0.6, 1.1, -0.1],
          [1.1, 1.1, -0.1],
        ]),
        color: copper,
      })
      parts.push({ geometry: box(0.66, 2.3, 0.66, -1.05, 0, 0.3), color: brick })
      parts.push({ geometry: box(0.5, 0.45, 0.5, -1.05, 2.28, 0.3), color: copper })
      parts.push({ geometry: frustum(0.25, 0, 2.7, 3.05, -1.05, 0.3), color: copper })
      parts.push({ geometry: drum(0.03, 0.02, 0.45, 5, -1.05, 2.95, 0.3), color: gold })
      for (let index = 0; index < 3; index++) {
        const angle = (index * Math.PI * 2) / 3
        crownParts(
          -1.05 + Math.sin(angle) * 0.13,
          3.38,
          0.3 + Math.cos(angle) * 0.13,
          0.08
        ).forEach(geometry => parts.push({ geometry, color: gold }))
      }
      parts.push({ geometry: drum(0.2, 0.2, 1.05, 8, 1.45, -0.05, 0.4), color: brick })
      parts.push({ geometry: onionDome(0.21, 0.42, 1.45, 0.98, 0.4), color: copper })
      for (const x of [-0.45, -0.05, 0.35, 0.75]) {
        parts.push({
          geometry: box(0.14, 0.32, 0.02, x, 0.15, 0.555),
          color: BOARD_COLORS.darkBlue,
          outline: false,
        })
      }
      return parts
    },
  },

  berlinTvTower: {
    plinth: { width: 1.4, depth: 1.4, round: true, color: BOARD_COLORS.sourMilk },
    parts: () => {
      const concrete = BOARD_COLORS.sourMilk
      const parts: MarkerPart[] = []
      parts.push({ geometry: drum(0.24, 0.11, 3.1, 8, 0, 0), color: concrete })
      const ball = new SphereGeometry(0.46, 10, 8)
      ball.translate(0, 3.4, 0)
      parts.push({ geometry: faceted(ball), color: BOARD_COLORS.silver })
      parts.push({
        geometry: drum(0.47, 0.47, 0.08, 10, 0, 3.36),
        color: BOARD_COLORS.darkBlue,
        outline: false,
      })
      parts.push({ geometry: drum(0.09, 0.07, 0.45, 6, 0, 3.8), color: concrete })
      for (let index = 0; index < 4; index++) {
        parts.push({
          geometry: drum(0.05, 0.045, 0.22, 6, 0, 4.2 + index * 0.22),
          color: index % 2 === 0 ? BOARD_COLORS.hiorAnge : concrete,
        })
      }
      return parts
    },
  },

  motherland: {
    plinth: { width: 1.9, depth: 1.9, round: true, height: 0.77, color: BOARD_COLORS.warmSand },
    parts: () => {
      const steel = BOARD_COLORS.silver
      const parts: MarkerPart[] = []
      parts.push({ geometry: drum(0.36, 0.17, 1.95, 8, 0, 0.5), color: steel })
      const head = new SphereGeometry(0.14, 8, 6)
      head.translate(0, 2.57, 0)
      parts.push({ geometry: faceted(head), color: steel })
      const fist = new Vector3(0.42, 3.05, 0.05)
      parts.push({ geometry: strut(new Vector3(0.1, 2.35, 0), fist, 0.055), color: steel })
      parts.push({
        geometry: frustum(0.035, 0.008, 3.0, 4.2, 0.42, 0.05, 0.6, 0.08),
        color: steel,
      })
      parts.push({
        geometry: strut(new Vector3(-0.1, 2.35, 0), new Vector3(-0.52, 2.62, 0.14), 0.055),
        color: steel,
      })
      const shield = plaque(0.3, 0.06, 10)
      shield.scale(1, 1.2, 1)
      shield.rotateY(-0.35)
      shield.translate(-0.6, 2.7, 0.2)
      parts.push({ geometry: shield, color: steel })
      return parts
    },
  },

  tajMahal: {
    plinth: { width: 2.9, depth: 2.9, color: BOARD_COLORS.sourMilk },
    parts: () => {
      const marble = BOARD_COLORS.sourMilk
      const parts: MarkerPart[] = []
      const hall = new CylinderGeometry(0.85, 0.85, 1.05, 8)
      hall.rotateY(Math.PI / 8)
      hall.translate(0, 0.475, 0)
      parts.push({ geometry: faceted(hall), color: marble })
      const iwan = new Shape(
        [
          [-0.22, 0],
          [0.22, 0],
          [0.22, 0.5],
          [0, 0.72],
          [-0.22, 0.5],
        ].map(([px, py]) => new Vector2(px, py))
      )
      const arch = new ExtrudeGeometry(iwan, { depth: 0.03, bevelEnabled: false })
      arch.translate(0, 0.2, 0.775)
      parts.push({ geometry: arch, color: BOARD_COLORS.softBlue, outline: false })
      parts.push({ geometry: drum(0.32, 0.32, 0.18, 10, 0, 0.98), color: marble })
      parts.push({ geometry: onionDome(0.36, 0.9, 0, 1.14), color: marble })
      parts.push({ geometry: drum(0.03, 0.015, 0.3, 5, 0, 2.02), color: BOARD_COLORS.warmSand })
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const reach = 0.62 / Math.SQRT2
          parts.push({
            geometry: onionDome(0.12, 0.3, sx * reach, 0.98, sz * reach),
            color: marble,
          })
          parts.push({
            geometry: drum(0.1, 0.07, 1.75, 8, sx * 1.2, -0.05, sz * 1.2),
            color: marble,
          })
          parts.push({ geometry: onionDome(0.11, 0.24, sx * 1.2, 1.68, sz * 1.2), color: marble })
        }
      }
      return parts
    },
  },

  templeOfHeaven: {
    plinth: { width: 2.2, depth: 2.2, round: true, height: 0.44, color: BOARD_COLORS.sourMilk },
    parts: () => {
      const wall = BOARD_COLORS.hiorAnge
      const tile = BOARD_COLORS.softBlue
      const parts: MarkerPart[] = []
      let base = 0.2
      for (const [body, height, eave, roof] of [
        [0.55, 0.42, 0.85, 0.3],
        [0.44, 0.3, 0.68, 0.28],
        [0.33, 0.26, 0.52, 0.4],
      ]) {
        parts.push({ geometry: drum(body, body, height + 0.04, 12, 0, base), color: wall })
        parts.push({ geometry: drum(eave, 0, roof, 12, 0, base + height), color: tile })
        base += height + roof * 0.45
      }
      const finial = new SphereGeometry(0.08, 8, 6)
      finial.translate(0, base + 0.26, 0)
      parts.push({ geometry: faceted(finial), color: BOARD_COLORS.warmSand })
      return parts
    },
  },

  fujiPagoda: {
    plinth: { width: 3.9, depth: 3.9, round: true, x: 0.1, z: -0.1, color: BOARD_COLORS.softMint },
    parts: () => {
      const parts: MarkerPart[] = []
      const PEAK = 1.6
      const SUMMIT = 0.18
      const FOOT = 1.15
      const radiusAt = (y: number) => FOOT - ((FOOT - SUMMIT) * y) / PEAK
      parts.push({
        geometry: drum(FOOT, SUMMIT, PEAK + 0.05, 9, 0.5, -0.05, -0.55),
        color: BOARD_COLORS.softBlue,
      })
      const SNOWLINE = 1.0
      parts.push({
        geometry: drum(
          radiusAt(SNOWLINE) + 0.02,
          SUMMIT + 0.02,
          PEAK - SNOWLINE + 0.01,
          9,
          0.5,
          SNOWLINE,
          -0.55
        ),
        color: BOARD_COLORS.sourMilk,
      })
      let base = -0.05
      for (let tier = 0; tier < 5; tier++) {
        const half = 0.22 - tier * 0.025
        const eave = half + 0.17
        parts.push({
          geometry: box(half * 2, 0.24, half * 2, -0.85, base, 0.85),
          color: BOARD_COLORS.hiorAnge,
        })
        parts.push({
          geometry: frustum(eave, eave * 0.35, base + 0.2, base + 0.32, -0.85, 0.85),
          color: BOARD_COLORS.darkBlue,
        })
        base += 0.28
      }
      parts.push({
        geometry: drum(0.03, 0.015, 0.5, 5, -0.85, base, 0.85),
        color: BOARD_COLORS.warmSand,
      })
      return parts
    },
  },
  burjKhalifa: {
    plinth: { width: 1.9, depth: 1.9, round: true, color: BOARD_COLORS.sourMilk },
    parts: () => {
      const glass = BOARD_COLORS.silver
      const parts: MarkerPart[] = []
      parts.push({ geometry: drum(0.2, 0.15, 3.7, 6, 0, 0), color: glass })
      parts.push({ geometry: drum(0.06, 0.012, 1.0, 5, 0, 3.6), color: glass })
      for (let wing = 0; wing < 3; wing++) {
        const turn = (wing * Math.PI * 2) / 3
        for (const [reach, top] of [
          [0.75, 0.9],
          [0.62, 1.7],
          [0.5, 2.4],
          [0.38, 3.0],
          [0.27, 3.45],
        ]) {
          const setback = box(0.24, top, reach, 0, 0, reach / 2)
          setback.rotateY(turn)
          parts.push({ geometry: setback, color: glass })
        }
      }
      return parts
    },
  },

  gizaPyramids: {
    plinth: { width: 3.5, depth: 3.3, x: 0.1, z: 0.12, color: BOARD_COLORS.sourMilk },
    parts: () => [
      ...pyramidParts(1.8, 1.2, -0.55, -0.45),
      ...pyramidParts(1.6, 1.1, 0.85, 0.2),
      ...pyramidParts(0.9, 0.6, -0.6, 1.15),
    ],
  },
  djenneMosque: {
    plinth: { width: 3.1, depth: 1.9, color: BOARD_COLORS.warmSand },
    parts: () => {
      const mud = BOARD_COLORS.duneShade
      const parts: MarkerPart[] = []
      parts.push({ geometry: box(2.7, 0.8, 1.5, 0, -0.05, -0.1), color: mud })
      for (const x of [-0.85, 0, 0.85]) {
        parts.push({ geometry: frustum(0.22, 0.13, -0.05, 1.45, x, 0.68), color: mud })
        parts.push({ geometry: frustum(0.13, 0, 1.44, 1.72, x, 0.68), color: mud })
        for (const y of [0.45, 0.8, 1.15]) {
          parts.push({
            geometry: box(0.035, 0.035, 0.5, x, y, 0.68),
            color: BOARD_COLORS.darkBlue,
            outline: false,
          })
        }
      }
      for (const x of [-1.25, 1.25]) {
        parts.push({ geometry: frustum(0.15, 0.1, -0.05, 1.05, x, 0.6), color: mud })
        parts.push({ geometry: frustum(0.1, 0, 1.04, 1.28, x, 0.6), color: mud })
      }
      return parts
    },
  },

  whiteHouse: {
    plinth: { width: 4.7, depth: 2.0, z: 0.1, color: BOARD_COLORS.softMint },
    parts: () => {
      const marble = BOARD_COLORS.sourMilk
      const parts: MarkerPart[] = []
      const FRONT = 0.375
      parts.push({ geometry: box(2.1, 0.85, 0.95, 0, -0.05, -0.1), color: marble })
      parts.push({ geometry: box(2.18, 0.09, 1.03, 0, 0.78, -0.1), color: marble })
      parts.push({
        geometry: hull([
          [-0.95, 0.85, -0.5],
          [0.95, 0.85, -0.5],
          [0.95, 0.85, 0.3],
          [-0.95, 0.85, 0.3],
          [-0.45, 1.08, -0.1],
          [0.45, 1.08, -0.1],
        ]),
        color: BOARD_COLORS.silver,
      })
      parts.push({ geometry: drum(0.5, 0.5, 0.1, 12, 0, 0.72, FRONT), color: marble })
      parts.push({ geometry: drum(0.36, 0.36, 0.04, 12, 0, 0.38, FRONT), color: marble })
      for (let index = 0; index < 6; index++) {
        const angle = -Math.PI * 0.42 + (index * Math.PI * 0.84) / 5
        parts.push({
          geometry: drum(
            0.035,
            0.03,
            0.78,
            6,
            Math.sin(angle) * 0.43,
            -0.05,
            FRONT + Math.cos(angle) * 0.43
          ),
          color: marble,
        })
      }
      for (const x of [-0.88, -0.62, 0.62, 0.88]) {
        for (const y of [0.12, 0.48]) {
          parts.push({
            geometry: box(0.11, 0.18, 0.02, x, y, FRONT + 0.006),
            color: BOARD_COLORS.darkBlue,
            outline: false,
          })
        }
      }
      parts.push({
        geometry: drum(0.015, 0.015, 0.55, 5, 0, 0.95, -0.1),
        color: BOARD_COLORS.darkBlue,
      })
      parts.push({
        geometry: box(0.22, 0.13, 0.015, 0.125, 1.35, -0.1),
        color: BOARD_COLORS.hiorAnge,
      })

      // The West Wing, still standing.
      parts.push({ geometry: box(0.56, 0.34, 0.28, -1.27, -0.05, -0.35), color: marble })
      parts.push({ geometry: box(0.68, 0.55, 0.95, -1.88, -0.05, -0.3), color: marble })

      // Where the East Wing stood: rubble, a ballroom's bare steel and its crane.
      parts.push({
        geometry: box(1.3, 0.02, 1.5, 1.72, -0.005, -0.15),
        color: BOARD_COLORS.warmSand,
        outline: false,
      })
      parts.push({ geometry: box(1.0, 0.08, 1.05, 1.78, -0.05, -0.3), color: BOARD_COLORS.silver })
      for (const x of [1.36, 1.78, 2.2]) {
        for (const z of [-0.72, 0.12]) {
          if (x === 2.2 && z === 0.12) continue
          parts.push({ geometry: box(0.05, 0.75, 0.05, x, 0.03, z), color: BOARD_COLORS.darkBlue })
        }
      }
      parts.push({
        geometry: box(0.9, 0.05, 0.05, 1.78, 0.75, -0.72),
        color: BOARD_COLORS.darkBlue,
      })
      parts.push({
        geometry: box(0.47, 0.05, 0.05, 1.57, 0.75, 0.12),
        color: BOARD_COLORS.darkBlue,
      })
      for (const [x, z, width, height, depth, yaw, tilt, color] of [
        [1.3, 0.42, 0.3, 0.12, 0.2, 0.4, 0.25, BOARD_COLORS.sourMilk],
        [1.55, 0.5, 0.22, 0.1, 0.16, -0.7, -0.3, BOARD_COLORS.silver],
        [1.75, 0.36, 0.26, 0.09, 0.14, 1.2, 0.2, BOARD_COLORS.sourMilk],
        [1.45, 0.28, 0.16, 0.14, 0.12, 0.2, 0.45, BOARD_COLORS.silver],
      ] as const) {
        const chunk = new BoxGeometry(width, height, depth)
        chunk.rotateZ(tilt)
        chunk.rotateY(yaw)
        chunk.translate(x, 0.03, z)
        parts.push({ geometry: chunk, color })
      }
      const crane = BOARD_COLORS.hiorAnge
      parts.push({ geometry: box(0.1, 1.72, 0.1, 2.25, -0.05, 0.42), color: crane })
      parts.push({ geometry: box(0.18, 0.14, 0.18, 2.25, 1.6, 0.42), color: BOARD_COLORS.darkBlue })
      const tip = new Vector3(1.45, 2.4, 0.2)
      parts.push({ geometry: strut(new Vector3(2.25, 1.67, 0.42), tip, 0.035, 4), color: crane })
      parts.push({
        geometry: strut(tip, new Vector3(1.45, 1.3, 0.2), 0.008, 4),
        color: BOARD_COLORS.darkBlue,
        outline: false,
      })
      parts.push({ geometry: box(0.42, 0.05, 0.06, 1.45, 1.25, 0.2), color: BOARD_COLORS.darkBlue })
      return parts
    },
  },

  statueOfLiberty: {
    plinth: { width: 2.1, depth: 2.1, round: true, height: 0.42, color: BOARD_COLORS.warmSand },
    parts: () => {
      const copper = BOARD_COLORS.softMint
      const granite = BOARD_COLORS.sourMilk
      const parts: MarkerPart[] = []
      parts.push({ geometry: frustum(0.42, 0.32, 0.15, 1.15), color: granite })
      parts.push({ geometry: box(0.74, 0.1, 0.74, 0, 1.12), color: granite })
      parts.push({ geometry: drum(0.25, 0.15, 1.32, 8, 0, 1.18), color: copper })
      const head = new SphereGeometry(0.13, 8, 6)
      head.translate(0, 2.6, 0)
      parts.push({ geometry: faceted(head), color: copper })
      for (let ray = 0; ray < 7; ray++) {
        const angle = -Math.PI * 0.45 + (ray * Math.PI * 0.9) / 6
        const out = new Vector3(Math.sin(angle) * 0.3, 0.22, Math.cos(angle) * 0.12)
        parts.push({
          geometry: strut(new Vector3(0, 2.66, 0), new Vector3(0, 2.66, 0).add(out), 0.018, 4),
          color: copper,
        })
      }
      const shoulder = new Vector3(0.14, 2.38, 0)
      const hand = new Vector3(0.22, 3.15, 0.02)
      parts.push({ geometry: strut(shoulder, hand, 0.05), color: copper })
      parts.push({
        geometry: drum(0.05, 0.07, 0.16, 6, 0.22, 3.12, 0.02),
        color: BOARD_COLORS.warmSand,
      })
      parts.push({
        geometry: frustum(0.055, 0, 3.27, 3.5, 0.22, 0.02),
        color: BOARD_COLORS.hiorAnge,
      })
      const tablet = new BoxGeometry(0.16, 0.28, 0.05)
      tablet.rotateZ(0.3)
      tablet.translate(-0.2, 2.05, 0.1)
      parts.push({ geometry: tablet, color: copper })
      return parts
    },
  },

  chichenItza: {
    plinth: { width: 3.3, depth: 3.5, z: 0.15, color: BOARD_COLORS.softMint },
    parts: () => {
      const stone = BOARD_COLORS.warmSand
      const TOP = 1.35
      const parts = terracedMound(
        [-1.3, 1.3, -1.3, 1.3],
        [-0.4, 0.4, -0.4, 0.4],
        TOP,
        5,
        stone,
        BOARD_COLORS.duneShade
      )
      parts.push({
        geometry: hull([
          [-0.26, -0.05, 1.5],
          [0.26, -0.05, 1.5],
          [-0.26, TOP, 0.42],
          [0.26, TOP, 0.42],
          [-0.26, -0.05, 0.4],
          [0.26, -0.05, 0.4],
        ]),
        color: BOARD_COLORS.duneShade,
      })
      parts.push({ geometry: box(0.62, 0.42, 0.62, 0, TOP - 0.03), color: stone })
      parts.push({
        geometry: box(0.16, 0.24, 0.02, 0, TOP, 0.315),
        color: BOARD_COLORS.darkBlue,
        outline: false,
      })
      return parts
    },
  },
  machuPicchu: {
    plinth: { width: 3.5, depth: 3.45, x: 0.1, z: -0.175, color: BOARD_COLORS.softMint },
    parts: () => {
      const grass = BOARD_COLORS.softMint
      const parts: MarkerPart[] = []
      parts.push({ geometry: drum(0.7, 0, 2.45, 7, 0.45, -0.05, -1.05), color: grass })
      parts.push({ geometry: drum(0.45, 0, 1.35, 6, 1.25, -0.05, -0.75), color: grass })
      const TOP = 0.96
      parts.push(
        ...terracedMound(
          [-1.5, 1.1, -0.1, 1.4],
          [-0.9, 0.5, -0.1, 0.8],
          TOP,
          4,
          grass,
          BOARD_COLORS.warmSand
        )
      )
      for (const [x, z, width, depth] of [
        [-0.6, 0.1, 0.3, 0.26],
        [-0.15, 0.05, 0.36, 0.3],
        [0.25, 0.15, 0.28, 0.26],
        [-0.45, 0.55, 0.28, 0.24],
        [0.2, 0.55, 0.3, 0.24],
      ]) {
        parts.push({
          geometry: box(width, 0.26, depth, x, TOP - 0.05, z),
          color: BOARD_COLORS.warmSand,
        })
      }
      parts.push({
        geometry: frustum(0.2, 0, TOP + 0.19, TOP + 0.42, -0.15, 0.05),
        color: BOARD_COLORS.darkBlue,
      })
      return parts
    },
  },
  moai: {
    plinth: { width: 3.4, depth: 1.4, color: BOARD_COLORS.softMint },
    parts: () => {
      const stone = BOARD_COLORS.basalt
      const parts: MarkerPart[] = []
      parts.push({ geometry: box(3.0, 0.32, 0.8, 0, -0.02), color: BOARD_COLORS.warmSand })
      for (const [x, height] of [
        [-1.05, 1.25],
        [-0.35, 1.4],
        [0.35, 1.3],
        [1.05, 1.2],
      ]) {
        parts.push({ geometry: frustum(0.2, 0.16, 0.28, 0.3 + height, x, 0), color: stone })
        parts.push({ geometry: box(0.34, 0.08, 0.1, x, 0.3 + height * 0.7, 0.16), color: stone })
        parts.push({
          geometry: hull([
            [x - 0.06, 0.3 + height * 0.68, 0.2],
            [x + 0.06, 0.3 + height * 0.68, 0.2],
            [x, 0.3 + height * 0.68, 0.1],
            [x - 0.07, 0.3 + height * 0.45, 0.27],
            [x + 0.07, 0.3 + height * 0.45, 0.27],
            [x, 0.3 + height * 0.45, 0.1],
          ]),
          color: stone,
        })
        parts.push({
          geometry: drum(0.18, 0.16, 0.2, 8, x, 0.28 + height, 0),
          color: BOARD_COLORS.hiorAnge,
        })
      }
      return parts
    },
  },

  sydneyOperaHouse: {
    plinth: { width: 4.0, depth: 2.2, color: BOARD_COLORS.pondBlue },
    parts: () => {
      const parts: MarkerPart[] = []
      const PODIUM = 0.3
      parts.push({ geometry: box(3.7, PODIUM + 0.05, 1.6, 0, -0.05), color: BOARD_COLORS.warmSand })
      parts.push({
        geometry: hull([
          [-1.85, -0.05, -0.55],
          [-1.85, -0.05, 0.55],
          [-1.85, PODIUM, -0.55],
          [-1.85, PODIUM, 0.55],
          [-1.95, -0.05, -0.5],
          [-1.95, -0.05, 0.5],
        ]),
        color: BOARD_COLORS.duneShade,
      })
      // A sail in side profile: steep leading edge up to a tip leaning past
      // its foot, a convex back sweeping down to the podium; thickest low.
      const PROFILE: [number, number][] = [
        [0, 0],
        [0.1, 0.55],
        [0.2, 1],
        [-0.25, 0.82],
        [-0.6, 0.5],
        [-0.85, 0.2],
        [-1, 0],
      ]
      // Laid foot to foot along +x so no two shells touch; the first faces
      // back, the rest rise toward the harbour.
      let cursor = -1.6
      for (const [length, height, half, facing] of [
        [0.5, 0.8, 0.42, -1],
        [0.62, 1.05, 0.5, 1],
        [0.78, 1.4, 0.58, 1],
        [0.95, 1.8, 0.66, 1],
      ] as const) {
        const points: Point[] = []
        for (const [px, py] of PROFILE) {
          const across = half * Math.max(0.05, 1 - py) ** 0.6
          const x = cursor + (facing === 1 ? (px + 1) * length : -px * length)
          points.push(
            [x, PODIUM - 0.02 + py * height, across],
            [x, PODIUM - 0.02 + py * height, -across]
          )
        }
        parts.push({ geometry: hull(points), color: BOARD_COLORS.sourMilk })
        cursor += length + 0.04
      }
      return parts
    },
  },
  uluru: {
    plinth: { width: 4.4, depth: 2.3, round: true, color: BOARD_COLORS.warmSand },
    parts: () => {
      const points: Point[] = []
      for (const [y, long, wide] of [
        [-0.05, 1.9, 0.85],
        [0.25, 1.85, 0.8],
        [0.85, 1.65, 0.66],
        [1.2, 1.3, 0.46],
        [1.35, 0.8, 0.26],
      ]) {
        for (let index = 0; index < 12; index++) {
          const angle = (index * Math.PI) / 6
          points.push([Math.cos(angle) * long, y, Math.sin(angle) * wide])
        }
      }
      return [{ geometry: hull(points), color: BOARD_COLORS.ochre }]
    },
  },
  southPole: {
    plinth: { width: 3.3, depth: 3.3, round: true, color: BOARD_COLORS.sourMilk },
    parts: () => {
      const parts: MarkerPart[] = []
      for (let band = 0; band < 5; band++) {
        parts.push({
          geometry: drum(0.065, 0.065, 0.21, 8, 0, band * 0.2 - 0.05),
          color: band % 2 === 0 ? BOARD_COLORS.hiorAnge : BOARD_COLORS.sourMilk,
        })
      }
      const mirror = new SphereGeometry(0.17, 10, 8)
      mirror.translate(0, 1.1, 0)
      parts.push({ geometry: faceted(mirror), color: BOARD_COLORS.silver })
      const flags = [
        BOARD_COLORS.hiorAnge,
        BOARD_COLORS.softBlue,
        BOARD_COLORS.warmSand,
        BOARD_COLORS.darkBlue,
        BOARD_COLORS.softMint,
      ]
      for (let index = 0; index < 7; index++) {
        const angle = Math.PI * 0.3 + (index * Math.PI * 1.4) / 6
        const x = Math.sin(angle) * 0.85
        const z = Math.cos(angle) * 0.85
        parts.push({
          geometry: drum(0.022, 0.022, 0.85, 4, x, -0.02, z),
          color: BOARD_COLORS.darkBlue,
          outline: false,
        })
        const flag = new BoxGeometry(0.32, 0.2, 0.02)
        flag.translate(0.16, 0, 0)
        flag.rotateY(angle + Math.PI / 2)
        flag.translate(x, 0.71, z)
        parts.push({ geometry: flag, color: flags[index % flags.length] })
      }
      parts.push({ geometry: box(1.3, 0.36, 0.5, 0, 0.45, -1.2), color: BOARD_COLORS.silver })
      for (const x of [-0.5, 0, 0.5]) {
        parts.push({
          geometry: box(0.07, 0.48, 0.07, x, -0.02, -1.2),
          color: BOARD_COLORS.darkBlue,
        })
      }
      for (const x of [-0.4, -0.13, 0.13, 0.4]) {
        parts.push({
          geometry: box(0.14, 0.1, 0.02, x, 0.58, -0.945),
          color: BOARD_COLORS.darkBlue,
          outline: false,
        })
      }
      return parts
    },
  },
}

/** A plinth is an inked slab that stands wholly above the ground and an
 *  un-inked skirt below it: an ink hull crossing the terrain breaks into teeth. */
const plinthParts = (plinth: Plinth, sink: number): MarkerPart[] => {
  const { width, depth, x = 0, z = 0, color } = plinth
  const slab = (inset: number, bottom: number, top: number) => {
    const height = top - bottom
    if (!plinth.round) return box(width - inset, height, depth - inset, x, bottom, z)
    const geometry = new CylinderGeometry((width - inset) / 2, (width - inset) / 2, height, 16)
    geometry.scale(1, 1, (depth - inset) / (width - inset))
    geometry.translate(x, bottom + height / 2, z)
    return geometry
  }
  return [
    { geometry: slab(0, SLAB_BOTTOM, plinth.height ?? PLINTH_LIFT), color, flatBase: true },
    { geometry: slab(0.04, -sink - FOOTING, SLAB_BOTTOM + 0.01), color, outline: false },
  ]
}

/** The site's monument in site space: y = 0 is the highest ground under the
 *  footprint, so the caller places it at `site.center` turned by `site.yaw`. */
export const landmarkParts = (site: LandmarkSite): MarkerPart[] => {
  const model = MODELS[site.kind]
  const parts = model.parts()
  parts.forEach(part => {
    part.geometry.translate(0, PLINTH_LIFT, 0)
    part.flatBase = true
  })
  parts.unshift(...plinthParts(model.plinth, site.sink))
  // Hulls carry no uv; the merge refuses mixed layouts.
  parts.forEach(part => part.geometry.deleteAttribute('uv'))
  return parts
}
