import { BOARD_COLORS } from '../board3d/colors'
import { seatRun } from '../hemicycle'
import type { BenchSide } from '../government'
import type { GovernmentState } from '~~/types/challenges/group-modes.type'

export type Vec3 = [number, number, number]

/** The building's measurements, in scene units. Front faces +z; the plinth top is the hall floor. */
export const PARLIAMENT = {
  plinth: { width: 8.4, depth: 7.2, height: 0.3, centerZ: 0.45 },
  hall: { width: 6.8, depth: 5, centerZ: -0.3, wallHeight: 1.7, wall: 0.2 },
  portico: { columns: 6, depth: 1.3, columnRadius: 0.15 },
  dome: { radius: 1.3, drum: 0.5 },
  chamber: { center: [0, 0.36, 1.25] as Vec3, radius: 2.9, tier: 0.075, seat: 0.068 },
} as const

export type ParliamentPhase = 'briefing' | 'party' | 'seats' | 'sides' | 'reveal'

export const parliamentPhase = (
  state: Pick<GovernmentState, 'briefing' | 'finished' | 'beat'>
): ParliamentPhase => {
  if (state.finished) return 'reveal'
  if (state.briefing) return 'briefing'
  return state.beat
}

export interface ParliamentPose {
  /** 0 bare plinth → 1 standing building. */
  build: number
  /** 0 roof on → 1 blown clear of the chamber, part by part. */
  roof: number
  /** 0 roof parts solid → 1 faded out. Held at 0 to leave the roof hovering in an exploded view. */
  roofGone: number
  /** 0 front wall and portico standing → 1 toppled and sunk into the plinth. */
  facade: number
  /** 0 walls full height → 1 cut down to `WALL_SECTION`, an architectural section. */
  walls: number
  /** 0 seats under the floor → 1 risen. */
  seats: number
  /** Orbit around `target`, radians: azimuth from the front (+z), elevation above the horizon. */
  azimuth: number
  elevation: number
  /** Radius of the sphere the camera fits inside its band. */
  fit: number
  target: Vec3
  /** Ambient orbit, radians per second. */
  drift: number
}

/** What share of their height the hall walls keep once cut to a section. */
export const WALL_SECTION = 0.36

const OUTSIDE = { roof: 0, roofGone: 0, facade: 0, walls: 0, seats: 0 }
const INSIDE = { roof: 1, roofGone: 1, facade: 1, walls: 1, seats: 1 }

export const PARLIAMENT_POSES: Record<ParliamentPhase, ParliamentPose> = {
  briefing: {
    build: 1,
    ...OUTSIDE,
    azimuth: 0.62,
    elevation: 0.3,
    fit: 4.9,
    target: [0, 1.5, 0.3],
    drift: 0.12,
  },
  party: {
    build: 1,
    ...OUTSIDE,
    azimuth: 0.36,
    elevation: 0.24,
    fit: 4.7,
    target: [0, 1.6, 0.4],
    drift: 0.035,
  },
  seats: {
    build: 1,
    ...INSIDE,
    azimuth: 0,
    elevation: 1.1,
    fit: 3.05,
    target: [0, 0.4, -0.15],
    drift: 0,
  },
  sides: {
    build: 1,
    ...INSIDE,
    azimuth: 0,
    elevation: 1.2,
    fit: 3.05,
    target: [0, 0.4, -0.15],
    drift: 0,
  },
  reveal: {
    build: 1,
    ...INSIDE,
    roof: 0.64,
    roofGone: 0,
    walls: 0.6,
    azimuth: -0.55,
    elevation: 0.6,
    fit: 5.6,
    target: [0, 2, -0.5],
    drift: 0.035,
  },
}

/** What a seat is wearing. */
export type SeatTone =
  'ghost' | 'lit' | 'right' | 'wrong' | 'governing' | 'with' | 'against' | 'backing' | 'opposition'

export const SEAT_TONES: Record<SeatTone, string> = {
  ghost: BOARD_COLORS.seatGhost,
  lit: BOARD_COLORS.darkBlue,
  right: BOARD_COLORS.verdictRight,
  wrong: BOARD_COLORS.hiorAnge,
  governing: BOARD_COLORS.darkBlue,
  with: BOARD_COLORS.softBlue,
  against: BOARD_COLORS.warmSand,
  backing: BOARD_COLORS.softBlue,
  opposition: BOARD_COLORS.seatGhost,
}

export interface ChamberInput {
  phase: ParliamentPhase
  totalSeats: number
  /** Beat 2: the block being considered, or the true block at its verdict. */
  preview?: number
  verdict?: 'right' | 'partial' | 'wrong'
  benches: readonly { name: string; seats?: number }[]
  governing?: string
  sorted: readonly string[]
  filed: Record<string, BenchSide>
  truth?: Record<string, BenchSide>
  standings?: Record<string, 'government' | 'backing' | 'opposition'>
  benchSeats?: Record<string, number>
}

export interface SeatGroup {
  tone: SeatTone
  seats: number
}

/**
 * The chamber as runs of seats, in left-to-right order — the same reading the
 * 2D arc and the reveal use, so the government's block grows from the left and
 * crosses the centre line exactly when it carries the house.
 */
export const chamberGroups = (input: ChamberInput): SeatGroup[] => {
  const { totalSeats } = input
  const ghost = (seats: number): SeatGroup => ({ tone: 'ghost', seats })
  const seatsOf = (name: string) =>
    input.benchSeats?.[name] ?? input.benches.find(bench => bench.name === name)?.seats ?? 0

  if (input.phase === 'seats' && input.preview !== undefined) {
    const lit = Math.min(totalSeats, input.preview)
    const tone: SeatTone = !input.verdict ? 'lit' : input.verdict === 'wrong' ? 'wrong' : 'right'
    return [{ tone, seats: lit }, ghost(totalSeats - lit)]
  }

  if (input.phase === 'sides') {
    const governing = input.governing ? seatsOf(input.governing) : 0
    const toneOf = (name: string, side: BenchSide): SeatTone => {
      if (!input.truth) return side === 'government' ? 'with' : 'against'
      return input.truth[name] === side ? 'right' : 'wrong'
    }
    const filedOn = (side: BenchSide) =>
      input.sorted
        .filter(name => input.filed[name] === side)
        .map(name => ({ tone: toneOf(name, side), seats: seatsOf(name) }))
    const withGroups = filedOn('government')
    const againstGroups = filedOn('opposition')
    const placed = [...withGroups, ...againstGroups].reduce((sum, group) => sum + group.seats, 0)
    return [
      { tone: 'governing', seats: governing },
      ...withGroups,
      ghost(Math.max(0, totalSeats - governing - placed)),
      ...againstGroups,
    ]
  }

  if (input.phase === 'reveal' && input.standings) {
    const order = ['government', 'backing', 'opposition'] as const
    const tones = { government: 'governing', backing: 'backing', opposition: 'opposition' } as const
    return order.flatMap(standing =>
      input.benches
        .filter(bench => (input.standings?.[bench.name] ?? 'opposition') === standing)
        .map(bench => ({ tone: tones[standing], seats: seatsOf(bench.name) }))
        .sort((a, b) => b.seats - a.seats)
    )
  }

  return [ghost(totalSeats)]
}

export const chamberTones = (dots: number, groups: readonly SeatGroup[]): SeatTone[] =>
  seatRun(
    dots,
    groups.map(group => ({ key: group.tone, seats: group.seats }))
  )

/**
 * The camera distance at which a sphere of `radius` fits the band of the
 * viewport it is framed in. `bandShare` is the band's height over the canvas
 * height; the narrower of the band and the canvas width decides.
 */
export const fitDistance = (radius: number, fovDeg: number, aspect: number, bandShare = 1) => {
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360)
  const tan = Math.min(tanHalf * Math.max(0.05, bandShare), tanHalf * aspect)
  return radius / Math.sin(Math.atan(tan))
}

/** Where an orbiting camera sits. */
export const orbitPosition = (
  target: Vec3,
  azimuth: number,
  elevation: number,
  distance: number
): Vec3 => [
  target[0] + Math.sin(azimuth) * Math.cos(elevation) * distance,
  target[1] + Math.sin(elevation) * distance,
  target[2] + Math.cos(azimuth) * Math.cos(elevation) * distance,
]

/** How far (px) to shift the rendered image down so its centre lands mid-band. */
export const bandShift = (height: number, band: { top: number; bottom: number }) =>
  height / 2 - (band.top + band.bottom) / 2

/** Frame-rate independent approach: the share of the remaining gap a channel closes in `dt` seconds. */
export const approach = (dt: number, rate: number) => 1 - Math.exp(-rate * dt)
