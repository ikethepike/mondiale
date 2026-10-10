import { MAP_REGIONS } from '~~/data/map.gen'
import { sample } from '~~/lib/arrays'
import { mainlandBox, pointInBox, unionBox, type MapBox } from '~~/lib/geo'
import type { SunsetBlitzChallenge } from '~~/types/challenges/final-challenge.type'
import type { GameDifficulty } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/** Terminator tilt off vertical, radians — the veil's top edge leads west. */
export const SUNSET_TILT = 0.17

/**
 * The night window per difficulty: how many countries the dealt frame holds,
 * the share of them that passes, and the night's pace — seconds it spends on
 * each country, easing from the first to the last so the run tightens as it
 * goes. Easy never deals the finale; its row keeps the record total.
 */
export const SUNSET_TUNING: {
  [difficulty in GameDifficulty]: {
    countries: [minimum: number, maximum: number]
    quotaRatio: number
    pace: [first: number, last: number]
  }
} = {
  easy: { countries: [8, 10], quotaRatio: 0.4, pace: [6, 4.5] },
  normal: { countries: [9, 12], quotaRatio: 0.5, pace: [5, 3.5] },
  hard: { countries: [11, 15], quotaRatio: 0.6, pace: [4, 2.5] },
}

/** The night's approach from off-screen east before its first country's turn. */
export const SUNSET_LEAD_SECONDS = 2

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

/** The field a frame deals: every pool country whose mainland centre it holds. */
export const windowCountries = (pool: ISOCountryCode[], frame: MapBox): ISOCountryCode[] =>
  pool.filter(isoCode => pointInBox(mapRegionCentre(isoCode), frame))

export const sunsetQuota = ({
  countries,
  quotaRatio,
}: Pick<SunsetBlitzChallenge, 'countries' | 'quotaRatio'>): number =>
  Math.ceil(countries.length * quotaRatio)

/**
 * When the night takes each country of a field, in seconds from the sweep's
 * start, east→west: one turn per country rather than one speed across the
 * map, so a dense cluster never falls in a burst and an empty stretch never
 * idles. The grading and the drawn line both read this one schedule.
 */
export const sunsetSchedule = (countryCount: number, difficulty: GameDifficulty): number[] => {
  const [first, last] = SUNSET_TUNING[difficulty].pace
  const times: number[] = []
  let at = SUNSET_LEAD_SECONDS
  for (let index = 0; index < countryCount; index++) {
    at += first + (last - first) * (index / Math.max(1, countryCount - 1))
    times.push(at)
  }
  return times
}

export const sunsetSeconds = (countryCount: number, difficulty: GameDifficulty): number =>
  Math.ceil(sunsetSchedule(countryCount, difficulty).at(-1) ?? SUNSET_LEAD_SECONDS)

/** How many of the field the night has taken `elapsed` seconds in. */
export const sunsetDarkCount = (schedule: readonly number[], elapsed: number): number => {
  let count = 0
  while (count < schedule.length && schedule[count]! <= elapsed) count++
  return count
}

/**
 * The run's verdict as soon as it is settled: `held` once the quota is lit,
 * `lost` once the countries still standing can no longer reach it.
 */
export const sunsetOutcome = (
  lit: number,
  standing: number,
  quota: number
): 'held' | 'lost' | undefined => {
  if (lit >= quota) return 'held'
  if (lit + standing < quota) return 'lost'
  return undefined
}

/**
 * The terminator over time: from `start` (off-screen east) through each
 * country's dusk coordinate at the very instant the schedule takes it, on a
 * monotone cubic so the line eases between turns instead of lurching at every
 * knot — and never backs up, so "who is dark" stays a prefix of the field.
 */
export const sunsetSweep = (
  field: readonly ISOCountryCode[],
  schedule: readonly number[],
  start: number
): ((elapsed: number) => number) => {
  const times = [0, ...schedule]
  const dusks = [start, ...field.map(sunsetDuskCoordinate)]
  const slopes = monotoneSlopes(times, dusks)
  return elapsed => {
    if (elapsed <= 0) return start
    let index = 1
    while (index < times.length - 1 && times[index]! < elapsed) index++
    if (elapsed >= times[index]!) return dusks[index]!
    const t0 = times[index - 1]!
    const span = times[index]! - t0
    const u = (elapsed - t0) / span
    const u2 = u * u
    const u3 = u2 * u
    return (
      (2 * u3 - 3 * u2 + 1) * dusks[index - 1]! +
      (u3 - 2 * u2 + u) * span * slopes[index - 1]! +
      (-2 * u3 + 3 * u2) * dusks[index]! +
      (u3 - u2) * span * slopes[index]!
    )
  }
}

// Fritsch–Carlson tangents: a Hermite spline through these never overshoots
// a knot, so a non-increasing series stays non-increasing between them
const monotoneSlopes = (xs: readonly number[], ys: readonly number[]): number[] => {
  const n = xs.length
  const secants = xs.slice(1).map((x, i) => (ys[i + 1]! - ys[i]!) / (x - xs[i]!))
  const slopes = xs.map((_, i) => {
    if (i === 0) return secants[0] ?? 0
    if (i === n - 1) return secants[n - 2]!
    const [before, after] = [secants[i - 1]!, secants[i]!]
    return before * after <= 0 ? 0 : (before + after) / 2
  })
  for (let i = 0; i < n - 1; i++) {
    const secant = secants[i]!
    if (secant === 0) {
      slopes[i] = 0
      slopes[i + 1] = 0
      continue
    }
    const a = slopes[i]! / secant
    const b = slopes[i + 1]! / secant
    const norm = a * a + b * b
    if (norm > 9) {
      const scale = 3 / Math.sqrt(norm)
      slopes[i] = scale * a * secant
      slopes[i + 1] = scale * b * secant
    }
  }
  return slopes
}

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
