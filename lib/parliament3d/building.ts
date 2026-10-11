import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Shape,
  ShapeGeometry,
  Vector2,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BOARD_COLORS } from '../board3d/colors'
import { faceted } from '../board3d/parts'
import { HEMICYCLE_ROWS, hemicycleRadii, hemicycleSeats } from '../hemicycle'
import { PARLIAMENT, type Vec3 } from './scene'

/**
 * Where a part sits in the deconstruction: `plinth` and `chamber` never move,
 * `hall` is cut down to a section, `facade` and `roof` parts fly apart on their
 * own motions, and `spine` is the majority line drawn on the chamber floor.
 */
export type PartGroup = 'plinth' | 'chamber' | 'spine' | 'hall' | 'facade' | 'roof'

/** How a part leaves the building as its channel runs 0 → 1. */
export interface PartMotion {
  channel: 'roof' | 'facade'
  /** Where it ends up, relative to where it stands. */
  offset: Vec3
  /** Its turn on the way, radians per axis. */
  spin?: Vec3
  /** Its start along the channel, 0–0.4: parts leave in sequence, not as one block. */
  delay: number
  /** Facade flyers fade as they go; roof parts fade with the whole roof. */
  fade?: boolean
}

export interface ParliamentPart {
  geometry: BufferGeometry
  color: string
  group: PartGroup
  /** When it rises during the build, 0 (first) → 1 (last). */
  order: number
  outline?: boolean
  /** Open shells (the dome's petals) show their inside once they come apart. */
  doubleSided?: boolean
  motion?: PartMotion
}

export interface ParliamentModel {
  parts: ParliamentPart[]
  seatGeometry: BufferGeometry
  /** The flagpole's top, where the flag hangs. */
  flagAnchor: Vec3
  /** The flag leaves with the lantern it flies from. */
  flagMotion: PartMotion
}

const { plinth, hall, portico, dome, chamber } = PARLIAMENT
const plinthTop = plinth.height
const hallBack = hall.centerZ - hall.depth / 2
const hallFront = hall.centerZ + hall.depth / 2
const wallTop = plinthTop + hall.wallHeight
const floorTop = plinthTop + 0.06
const porticoZ = hallFront + portico.depth / 2 + 0.05

/** A box by its footprint centre and its BASE height. */
const box = (width: number, height: number, depth: number, x: number, y: number, z: number) => {
  const geometry = new BoxGeometry(width, height, depth)
  geometry.translate(x, y + height / 2, z)
  return geometry
}

const column = (radius: number, height: number, x: number, y: number, z: number, sides = 8) => {
  const geometry = new CylinderGeometry(radius, radius * 1.08, height, sides)
  geometry.translate(x, y + height / 2, z)
  return faceted(geometry)
}

/**
 * The chamber's benches as ONE stepped solid: a half-lathe of the step profile
 * closed by its two end faces. Separate rings met at shared walls and shared end
 * planes, and every coplanar pair z-fought into flicker under the seats.
 */
const benches = (steps: readonly { inner: number; height: number }[], outer: number, y: number) => {
  const profile: Vector2[] = []
  let previous = 0
  for (const step of steps) {
    profile.push(new Vector2(step.inner, previous), new Vector2(step.inner, step.height))
    previous = step.height
  }
  profile.push(new Vector2(outer, previous), new Vector2(outer, 0))

  const shell = new LatheGeometry([...profile].reverse(), 24, Math.PI / 2, Math.PI)
  const end = (mirror: number) =>
    new ShapeGeometry(
      new Shape([
        ...profile.map(point => new Vector2(point.x * mirror, point.y)),
        new Vector2(steps[0]!.inner * mirror, 0),
      ])
    )
  shell.deleteAttribute('uv')
  const caps = [end(1), end(-1)].map(cap => {
    cap.deleteAttribute('uv')
    return cap
  })
  const solid = mergeGeometries([shell.toNonIndexed(), ...caps.map(cap => cap.toNonIndexed())])!
  solid.translate(chamber.center[0], y, chamber.center[2])
  return faceted(solid)
}

const tierHeight = (row: number, rows: number) => (rows - 1 - row) * chamber.tier

/** What stands on a surface stands this far above it: a shared plane z-fights. */
const SURFACE_CLEARANCE = 0.004
const SPINE_THICKNESS = 0.012

const STONE = BOARD_COLORS.stone
const TRIM = BOARD_COLORS.plinth
const PATINA = BOARD_COLORS.softMint
const SLATE = BOARD_COLORS.darkBlue

const DOME_PETALS = 8

/** Tilt a part's top outward, away from the dome's axis, as it flies off. */
const outwardTilt = (angle: number, amount: number): Vec3 => [
  Math.cos(angle) * amount,
  0,
  -Math.sin(angle) * amount,
]

export const buildParliament = (): ParliamentModel => {
  const parts: ParliamentPart[] = []
  const add = (part: ParliamentPart) => parts.push(part)

  add({
    geometry: box(plinth.width, plinth.height, plinth.depth, 0, 0, plinth.centerZ),
    color: TRIM,
    group: 'plinth',
    order: 0,
  })
  const plinthFront = plinth.centerZ + plinth.depth / 2
  add({
    geometry: box(5.6, plinth.height * 0.66, 0.34, 0, 0, plinthFront + 0.17),
    color: TRIM,
    group: 'plinth',
    order: 0.02,
  })
  add({
    geometry: box(5.6, plinth.height * 0.33, 0.34, 0, 0, plinthFront + 0.51),
    color: TRIM,
    group: 'plinth',
    order: 0.04,
  })

  add({
    geometry: box(
      hall.width - hall.wall * 2,
      0.06,
      hall.depth - hall.wall,
      0,
      plinthTop,
      hall.centerZ
    ),
    color: BOARD_COLORS.chamberFloor,
    group: 'chamber',
    order: 0.08,
  })
  const radii = hemicycleRadii(HEMICYCLE_ROWS)
  const spacing = (radii[0]! - radii[radii.length - 1]!) / (radii.length - 1)
  const steps = radii
    .map((radius, row) => ({
      inner: (radius - spacing / 2) * chamber.radius,
      height: tierHeight(row, radii.length),
    }))
    .filter(step => step.height > 0)
    .reverse()
  const outer = (radii[0]! + spacing / 2) * chamber.radius
  add({
    geometry: benches(steps, outer, floorTop),
    color: TRIM,
    group: 'chamber',
    order: 0.1,
  })
  add({
    geometry: box(0.9, 0.34, 0.36, 0, floorTop, chamber.center[2] + 0.42),
    color: SLATE,
    group: 'chamber',
    order: 0.16,
  })
  const spineFrom = chamber.center[2] - 0.25
  const landings = [
    { near: spineFrom, far: chamber.center[2] - steps[0]!.inner, height: 0 },
  ].concat(
    steps.map((step, index) => ({
      near: chamber.center[2] - step.inner,
      far: chamber.center[2] - (steps[index + 1]?.inner ?? outer),
      height: step.height,
    }))
  )
  for (const landing of landings) {
    add({
      geometry: box(
        0.04,
        SPINE_THICKNESS,
        landing.near - landing.far - 0.02,
        0,
        floorTop + landing.height + SURFACE_CLEARANCE,
        (landing.near + landing.far) / 2
      ),
      color: SLATE,
      group: 'spine',
      order: 0.5,
      outline: false,
    })
  }

  add({
    geometry: box(hall.width, hall.wallHeight, hall.wall, 0, plinthTop, hallBack + hall.wall / 2),
    color: STONE,
    group: 'hall',
    order: 0.2,
  })
  for (const side of [-1, 1]) {
    const x = side * (hall.width / 2 - hall.wall / 2)
    add({
      geometry: box(hall.wall, hall.wallHeight, hall.depth, x, plinthTop, hall.centerZ),
      color: STONE,
      group: 'hall',
      order: 0.24,
    })
    for (let window = 0; window < 4; window++) {
      const z = hallBack + 0.9 + window * ((hall.depth - 1.8) / 3)
      add({
        geometry: box(0.04, 0.8, 0.34, x + side * (hall.wall / 2 + 0.02), plinthTop + 0.5, z),
        color: SLATE,
        group: 'hall',
        order: 0.3 + window * 0.02,
        outline: false,
      })
    }
  }

  const sink = (delay: number): PartMotion => ({
    channel: 'facade',
    offset: [0, -hall.wallHeight - 0.1, 0],
    delay,
  })
  add({
    geometry: box(hall.width, hall.wallHeight, hall.wall, 0, plinthTop, hallFront - hall.wall / 2),
    color: STONE,
    group: 'facade',
    order: 0.28,
    motion: sink(0.34),
  })
  add({
    geometry: box(0.9, 1.1, 0.06, 0, plinthTop, hallFront + 0.02),
    color: SLATE,
    group: 'facade',
    order: 0.34,
    outline: false,
    motion: sink(0.34),
  })
  const span = hall.width - 1.4
  for (let index = 0; index < portico.columns; index++) {
    const x = -span / 2 + (index * span) / (portico.columns - 1)
    const topple: PartMotion = {
      channel: 'facade',
      offset: [x * 0.08, -hall.wallHeight - 0.25, 0.5],
      spin: [0.55, 0, (index - (portico.columns - 1) / 2) * -0.08],
      delay: 0.06 + index * 0.05,
    }
    add({
      geometry: column(portico.columnRadius, hall.wallHeight - 0.12, x, plinthTop + 0.06, porticoZ),
      color: STONE,
      group: 'facade',
      order: 0.38 + index * 0.025,
      motion: topple,
    })
    add({
      geometry: box(0.4, 0.06, 0.4, x, plinthTop, porticoZ),
      color: TRIM,
      group: 'facade',
      order: 0.37 + index * 0.025,
      motion: { ...topple, offset: [0, -0.2, 0], spin: undefined },
    })
    add({
      geometry: box(0.4, 0.06, 0.4, x, wallTop - 0.06, porticoZ),
      color: TRIM,
      group: 'facade',
      order: 0.42 + index * 0.025,
      motion: topple,
    })
  }
  add({
    geometry: box(span + 0.9, 0.26, portico.depth + 0.3, 0, wallTop, porticoZ - 0.05),
    color: STONE,
    group: 'facade',
    order: 0.58,
    motion: {
      channel: 'facade',
      offset: [0, 2.2, 2.6],
      spin: [0.45, 0, 0],
      delay: 0,
      fade: true,
    },
  })
  const pediment = new Shape([
    new Vector2(-(span + 0.9) / 2, 0),
    new Vector2((span + 0.9) / 2, 0),
    new Vector2(0, 0.72),
  ])
  const pedimentGeometry = new ExtrudeGeometry(pediment, { depth: 0.5, bevelEnabled: false })
  pedimentGeometry.translate(0, wallTop + 0.26, porticoZ + portico.depth / 2 - 0.3)
  add({
    geometry: faceted(pedimentGeometry),
    color: STONE,
    group: 'facade',
    order: 0.62,
    motion: { channel: 'facade', offset: [0, 3.1, 3.2], spin: [0.8, 0, 0], delay: 0, fade: true },
  })

  const slabTop = wallTop + 0.18
  add({
    geometry: box(hall.width + 0.3, 0.18, hall.depth + 0.3, 0, wallTop, hall.centerZ),
    color: TRIM,
    group: 'roof',
    order: 0.66,
    motion: { channel: 'roof', offset: [0, 2.4, -6.2], spin: [-1.25, 0, 0], delay: 0.36 },
  })
  add({
    geometry: column(dome.radius, dome.drum, 0, slabTop, hall.centerZ, 16),
    color: STONE,
    group: 'roof',
    order: 0.74,
    motion: { channel: 'roof', offset: [0, 2.8, -1.4], spin: [0, 0.9, 0], delay: 0.24 },
  })
  for (let index = 0; index < 16; index++) {
    const angle = (index / 16) * Math.PI * 2
    const radial: Vec3 = [Math.sin(angle), 0, Math.cos(angle)]
    add({
      geometry: box(
        0.08,
        dome.drum * 0.7,
        0.08,
        radial[0] * (dome.radius + 0.03),
        slabTop + dome.drum * 0.15,
        hall.centerZ + radial[2] * (dome.radius + 0.03)
      ),
      color: SLATE,
      group: 'roof',
      order: 0.78,
      outline: false,
      motion: {
        channel: 'roof',
        offset: [radial[0] * 2.6, 2.8, radial[2] * 2.6 - 1.4],
        spin: [0, 0.9, 0],
        delay: 0.24,
      },
    })
  }
  const domeBase = slabTop + dome.drum
  for (let petal = 0; petal < DOME_PETALS; petal++) {
    const span = (Math.PI * 2) / DOME_PETALS
    const profile = Array.from({ length: 8 }, (_, step) => {
      const angle = (step / 7) * (Math.PI / 2)
      return new Vector2(Math.cos(angle) * dome.radius, Math.sin(angle) * dome.radius * 0.92)
    })
    const geometry = new LatheGeometry(profile, 3, petal * span, span)
    geometry.translate(0, domeBase, hall.centerZ)
    const mid = petal * span + span / 2
    add({
      geometry: faceted(geometry),
      color: PATINA,
      group: 'roof',
      order: 0.84 + petal * 0.005,
      outline: false,
      doubleSided: true,
      motion: {
        channel: 'roof',
        offset: [Math.sin(mid) * 3.4, 3, Math.cos(mid) * 3.4],
        spin: outwardTilt(mid, 1.3),
        delay: 0.08 + petal * 0.015,
      },
    })
  }
  const crown = domeBase + dome.radius * 0.92
  const lanternMotion: PartMotion = {
    channel: 'roof',
    offset: [0, 4.8, 0],
    spin: [0, 2.4, 0],
    delay: 0,
  }
  add({
    geometry: column(0.2, 0.32, 0, crown - 0.04, hall.centerZ, 8),
    color: STONE,
    group: 'roof',
    order: 0.9,
    motion: lanternMotion,
  })
  const capGeometry = new CylinderGeometry(0, 0.26, 0.3, 8)
  capGeometry.translate(0, crown + 0.28 + 0.15, hall.centerZ)
  add({
    geometry: faceted(capGeometry),
    color: PATINA,
    group: 'roof',
    order: 0.93,
    motion: lanternMotion,
  })
  add({
    geometry: column(0.018, 0.75, 0, crown + 0.5, hall.centerZ, 6),
    color: SLATE,
    group: 'roof',
    order: 0.96,
    outline: false,
    motion: lanternMotion,
  })

  const seatGeometry = faceted(
    new CylinderGeometry(chamber.seat * 0.86, chamber.seat, chamber.seat * 1.5, 6)
  )
  seatGeometry.translate(0, (chamber.seat * 1.5) / 2, 0)

  return {
    parts,
    seatGeometry,
    flagAnchor: [0, crown + 1.25, hall.centerZ],
    flagMotion: lanternMotion,
  }
}

/** Every seat's floor position for a chamber drawn with `dots` marks, left to right — the 2D arc's order. */
export const seatPositions = (dots: number): Vec3[] => {
  const seats = hemicycleSeats(dots)
  const rows = Math.min(HEMICYCLE_ROWS, Math.max(1, dots))
  return seats.map(seat => [
    chamber.center[0] + ((seat.x - 50) / 50) * chamber.radius,
    floorTop + tierHeight(seat.row, rows) + SURFACE_CLEARANCE,
    chamber.center[2] - ((100 - seat.y) / 100) * chamber.radius,
  ])
}
