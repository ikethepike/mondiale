import { MAP_REGIONS } from '~~/data/map.gen'
import { sample } from '~~/lib/arrays'
import { mainlandBox, unionBox, type MapBox } from '~~/lib/geo'
import { clamp } from '~~/lib/number'
import type { GameDifficulty } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/** Terminator tilt off vertical, radians — the veil's top edge leads west. */
export const SUNSET_TILT = 0.17

/**
 * The night window per difficulty: how many countries the dealt frame holds,
 * the share of the field that passes, and how long the sweep buys each one.
 * The ratios are set against the field a SCREEN puts in play — two to three
 * times the dealt count on a desktop — not the dealt window alone. Easy never
 * deals the finale; its row keeps the record total.
 */
export const SUNSET_TUNING: {
  [difficulty in GameDifficulty]: {
    countries: [minimum: number, maximum: number]
    quotaRatio: number
    secondsPerCountry: number
  }
} = {
  easy: { countries: [8, 11], quotaRatio: 0.3, secondsPerCountry: 6 },
  normal: { countries: [10, 14], quotaRatio: 0.35, secondsPerCountry: 5 },
  hard: { countries: [12, 16], quotaRatio: 0.45, secondsPerCountry: 4 },
}

export const SUNSET_SECONDS: [minimum: number, maximum: number] = [40, 120]

// The frame's shape must survive the camera's aspect correction: a strip
// (Chile with Argentina, the Levant alone) would frame with most of the
// screen showing land the count never saw.
export const SUNSET_FRAME_ASPECT: [minimum: number, maximum: number] = [0.45, 3]
// How far past the members' centres the frame may reach to show their land:
// a share of the centres' own span, so a giant on the edge is clipped to the
// window rather than dragging the shot out to its far coast. Kept short —
// every unit of reach in a dense region catches another centre, and the
// camera pads the frame anyway.
const FRAME_REACH = 0.12
const FRAME_REACH_FLOOR = 8

export interface SunsetWindow {
  frame: MapBox
  /** The countries whose mainland centre lies inside `frame`, east→west. */
  countries: ISOCountryCode[]
}

/** A country's mainland centre in map space — screen coordinates, east = larger x. */
export const mapRegionCentre = (isoCode: ISOCountryCode): { x: number; y: number } => {
  const rings = MAP_REGIONS[isoCode]
  if (!rings?.length) return { x: 0, y: 0 }
  const [x, y, width, height] = rings[0]!
  return { x: x + width / 2, y: y + height / 2 }
}

/**
 * Position along the tilted dusk axis — the veil crosses countries in
 * DESCENDING order of this. Shared with the client so the tint timing and the
 * drawn terminator agree.
 */
export const sunsetDuskCoordinate = (isoCode: ISOCountryCode): number => {
  const { x, y } = mapRegionCentre(isoCode)
  return x - y * Math.tan(SUNSET_TILT)
}

const inBox = ({ x, y }: { x: number; y: number }, [left, top, width, height]: MapBox) =>
  x >= left && x <= left + width && y >= top && y <= top + height

/** The field a frame deals: every pool country whose mainland centre it holds. */
export const windowCountries = (pool: ISOCountryCode[], frame: MapBox): ISOCountryCode[] =>
  pool.filter(isoCode => inBox(mapRegionCentre(isoCode), frame))

/** The pass mark for a field — the dealt window, or the wider set a screen
 *  put in play — as the difficulty's share of it. */
export const sunsetQuota = (field: readonly ISOCountryCode[], quotaRatio: number): number =>
  Math.ceil(field.length * quotaRatio)

export const sunsetSeconds = (countryCount: number, difficulty: GameDifficulty): number =>
  clamp(countryCount * SUNSET_TUNING[difficulty].secondsPerCountry, ...SUNSET_SECONDS)

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)

const clip = ([x, y, width, height]: MapBox, [left, top, w, h]: MapBox): MapBox => {
  const cx = Math.max(x, left)
  const cy = Math.max(y, top)
  return [cx, cy, Math.min(x + width, left + w) - cx, Math.min(y + height, top + h) - cy]
}

/**
 * The frame the camera gets: the members' centres in one box, grown to show
 * their land — each mainland box clipped to a reach around the centres, so
 * Russia on the edge is cut at the window rather than framed to Vladivostok.
 */
const frameAround = (countries: ISOCountryCode[]): MapBox => {
  const centres = unionBox(
    countries.map(isoCode => [...Object.values(mapRegionCentre(isoCode)), 0, 0] as MapBox)
  )
  const reachX = Math.max(centres[2] * FRAME_REACH, FRAME_REACH_FLOOR)
  const reachY = Math.max(centres[3] * FRAME_REACH, FRAME_REACH_FLOOR)
  const reach: MapBox = [
    centres[0] - reachX,
    centres[1] - reachY,
    centres[2] + reachX * 2,
    centres[3] + reachY * 2,
  ]
  return unionBox(countries.map(isoCode => clip(mainlandBox(MAP_REGIONS[isoCode], reach), reach)))
}

const frameFits = ([, , width, height]: MapBox) => {
  const aspect = width / height
  return aspect >= SUNSET_FRAME_ASPECT[0] && aspect <= SUNSET_FRAME_ASPECT[1]
}

/**
 * The window a seed country anchors: its nearest neighbours by centre, grown
 * until the frame around them holds exactly them — a frame that catches a
 * centre the field never counted would put a dimmed country in the middle of
 * the window, so every centre the frame holds joins the field, and the frame
 * re-fits until the set closes. Undefined when the closure overshoots the
 * difficulty's range (the region is denser than the window) or never fits
 * the camera's shape. Deterministic per seed.
 */
export const sunsetWindowAround = (
  pool: ISOCountryCode[],
  difficulty: GameDifficulty,
  seed: ISOCountryCode
): SunsetWindow | undefined => {
  const [minimum, maximum] = SUNSET_TUNING[difficulty].countries
  const seedCentre = mapRegionCentre(seed)
  const nearest = [...pool].sort(
    (a, b) => distance(mapRegionCentre(a), seedCentre) - distance(mapRegionCentre(b), seedCentre)
  )
  for (let count = minimum; count <= Math.min(maximum, nearest.length); count++) {
    let members = nearest.slice(0, count)
    let frame = frameAround(members)
    let caught = windowCountries(pool, frame)
    while (caught.length > members.length && caught.length <= maximum) {
      members = caught
      frame = frameAround(members)
      caught = windowCountries(pool, frame)
    }
    if (caught.length > maximum) return undefined
    if (!frameFits(frame)) continue
    return {
      frame,
      countries: caught.sort((a, b) => sunsetDuskCoordinate(b) - sunsetDuskCoordinate(a)),
    }
  }
  return undefined
}

// A board's windows are a pure function of its pool, and enumerating them
// costs ~130ms — memoised per pool so a deal stays instant
const windowsByBoard = new Map<string, SunsetWindow[]>()

/** Every distinct window the board can anchor — neighbouring seeds often
 *  close on the same field, and a deal that drew by seed would favour it. */
export const sunsetWindows = (
  pool: ISOCountryCode[],
  difficulty: GameDifficulty
): SunsetWindow[] => {
  const boardKey = `${difficulty}:${pool.join(',')}`
  const cached = windowsByBoard.get(boardKey)
  if (cached) return cached
  const seen = new Set<string>()
  const windows: SunsetWindow[] = []
  for (const seed of pool) {
    const window = sunsetWindowAround(pool, difficulty, seed)
    if (!window) continue
    const key = [...window.countries].sort().join(',')
    if (seen.has(key)) continue
    seen.add(key)
    windows.push(window)
  }
  windowsByBoard.set(boardKey, windows)
  return windows
}

/**
 * A night window somewhere on the board: uniform over the distinct windows
 * the board can hold, so the finale lands on any part of the playable
 * region, never the same dense corner every time.
 */
export const pickSunsetWindow = (
  pool: ISOCountryCode[],
  difficulty: GameDifficulty
): SunsetWindow | undefined => {
  const windows = sunsetWindows(pool, difficulty)
  return windows.length ? sample(windows) : undefined
}
