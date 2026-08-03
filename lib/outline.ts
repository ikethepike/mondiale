import type { ISOCountryCode } from '~~/types/geography.types'
import { clamp01 } from './number'

export type OutlinePoint = [number, number]

/** The slice of the DOM this module reads, typed locally: outline geometry is
 *  reachable from the server tsconfig project (no DOM lib), so the read goes
 *  through globalThis and fails soft to undefined off-client. */
type DocumentLike = {
  querySelector(selector: string): { getAttribute(name: string): string | null } | null
}

/**
 * The country outlines live as SVG path data in the always-mounted world map.
 * Client-only by nature — callers run inside mounted components.
 */
export const countryPathData = (isoCode: ISOCountryCode): string | undefined =>
  (globalThis as { document?: DocumentLike }).document
    ?.querySelector(`.game-map path#${isoCode}`)
    ?.getAttribute('d') ?? undefined

/** Stroke width as a share of the frame — the classic hairline at stage size. */
export const STROKE_WIDTH_RATIO = 0.0045

/**
 * A country's MAINLAND ring as standalone path data, framed in its own
 * padded viewBox. Dash-reveals need one closed ring — the raw map path often
 * carries island subpaths that would smear the reveal into scattered slivers.
 *
 * Geometry comes from the HD tier (the same lazy chunk GameMap zooms into):
 * the outline stage blows a single country up to near-full-screen, where the
 * base tier's world-zoom simplification reads as jagged. Scraping the DOM is
 * only the fallback — the DOM path holds whatever tier the last camera
 * position happened to apply, so it isn't even deterministic.
 *
 * `strokeWidth` is in user units, scaled to the frame. The tempting
 * alternative — a fixed width with vector-effect: non-scaling-stroke — is a
 * trap for dash-reveals: per SVG2 (and Chromium) it moves stroke-dasharray
 * and stroke-dashoffset into SCREEN space while getTotalLength stays in user
 * units, shattering the reveal into repeating fragments. Everything must
 * live in the country's own units.
 */
export const mainlandOutline = async (
  isoCode: ISOCountryCode
): Promise<{ d: string; viewBox: string; span: number; strokeWidth: number } | undefined> => {
  const hd = await import('~~/data/map-hd.gen')
    .then(module => module.MAP_PATHS_HD as Partial<Record<ISOCountryCode, string>>)
    .catch(() => undefined)
  const pathData = hd?.[isoCode] ?? countryPathData(isoCode)
  if (!pathData) return undefined
  const ring = largestRing(pathData)
  if (!ring || ring.length < 3) return undefined

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of ring) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  const span = Math.max(maxX - minX, maxY - minY)
  const pad = span * 0.12
  return {
    d: `M ${ring.map(([x, y]) => `${x},${y}`).join(' L ')} Z`,
    viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`,
    span,
    strokeWidth: span * STROKE_WIDTH_RATIO,
  }
}

// --- Dash-reveal pacing --------------------------------------------------------
// Every duration here derives from the border's measured geometry, so the
// animation is relative to the country's size: the draw rate is proportional
// to its perimeter (it must cover `length` in a fixed clock share), and the
// preview sweep scales with intricacy (perimeter relative to frame).

/** The whole border lands with this fraction of the clock spent, leaving a
 *  beat to study the complete shape before time runs out. */
export const DRAW_COMPLETE_AT = 0.85

/**
 * Seconds for the preview's sweep-away, scaled to the border's intricacy —
 * its length relative to the span of its frame. A compact shape wipes in
 * under a second; a fjord-riddled coastline visibly unwinds.
 */
export const previewSweepSeconds = (length: number, span: number): number => {
  if (length <= 0 || span <= 0) return 0.7
  return Math.min(2.4, Math.max(0.7, 0.4 + (length / span) * 0.09))
}

/**
 * Fraction of the border drawn at `secondsLeft`. The draw picks up where the
 * preview handed over (`drawStartSecondsLeft`) and maps that remaining window
 * onto the clock so every country — however long its border — completes at
 * `completeAt` of the round (a race mode passes 1: the closing line IS the
 * deadline; the default leaves the study beat).
 */
export const drawnFraction = (
  secondsLeft: number,
  totalSeconds: number,
  drawStartSecondsLeft: number,
  completeAt: number = DRAW_COMPLETE_AT
): number => {
  const drawEndsAt = totalSeconds * (1 - completeAt)
  const window = Math.max(1, drawStartSecondsLeft - drawEndsAt)
  return clamp01((drawStartSecondsLeft - secondsLeft) / window)
}

/**
 * Parse polygonal SVG path data (the map paths are pure move/line/close
 * commands) into rings of points.
 */
export const parsePolygons = (d: string): OutlinePoint[][] => {
  const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g) ?? []
  const rings: OutlinePoint[][] = []
  let ring: OutlinePoint[] = []
  let x = 0
  let y = 0
  let ringStart: OutlinePoint = [0, 0]

  const flush = () => {
    if (ring.length > 2) rings.push(ring)
    ring = []
  }

  for (const chunk of commands) {
    const type = chunk[0]
    const numbers = chunk
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)

    switch (type) {
      case 'm':
      case 'M': {
        flush()
        for (let index = 0; index + 1 < numbers.length; index += 2) {
          if (type === 'm') {
            x += numbers[index]
            y += numbers[index + 1]
          } else {
            x = numbers[index]
            y = numbers[index + 1]
          }
          if (index === 0) ringStart = [x, y]
          ring.push([x, y])
        }
        break
      }
      case 'l':
      case 'L': {
        for (let index = 0; index + 1 < numbers.length; index += 2) {
          if (type === 'l') {
            x += numbers[index]
            y += numbers[index + 1]
          } else {
            x = numbers[index]
            y = numbers[index + 1]
          }
          ring.push([x, y])
        }
        break
      }
      case 'h':
      case 'H': {
        for (const value of numbers) {
          x = type === 'h' ? x + value : value
          ring.push([x, y])
        }
        break
      }
      case 'v':
      case 'V': {
        for (const value of numbers) {
          y = type === 'v' ? y + value : value
          ring.push([x, y])
        }
        break
      }
      case 'z':
      case 'Z': {
        flush()
        ;[x, y] = ringStart
        break
      }
    }
  }
  flush()

  return rings
}

/** Shoelace area of a closed ring — the one copy (empire morphing uses it too). */
export const ringArea = (ring: readonly (readonly [number, number])[]): number => {
  let area = 0
  for (let index = 0; index < ring.length; index++) {
    const [x1, y1] = ring[index]
    const [x2, y2] = ring[(index + 1) % ring.length]
    area += x1 * y2 - x2 * y1
  }
  return Math.abs(area / 2)
}

/** Mean-of-vertices centre of a ring. */
export const ringCentroid = (ring: readonly (readonly [number, number])[]): [number, number] => {
  let x = 0
  let y = 0
  for (const [px, py] of ring) {
    x += px
    y += py
  }
  return [x / ring.length, y / ring.length]
}

/** The mainland: the largest ring by area (archipelago islands drop away). */
export const largestRing = (d: string): OutlinePoint[] | undefined => {
  const rings = parsePolygons(d)
  if (!rings.length) return undefined
  return rings.reduce((largest, ring) => (ringArea(ring) > ringArea(largest) ? ring : largest))
}

/** Resample a closed polyline to `count` points, evenly spaced by arc length. */
export const resampleClosed = (points: OutlinePoint[], count = 96): OutlinePoint[] => {
  if (points.length < 3) return points

  const closed = [...points, points[0]]
  const segmentLengths: number[] = []
  let total = 0
  for (let index = 0; index + 1 < closed.length; index++) {
    const [x1, y1] = closed[index]
    const [x2, y2] = closed[index + 1]
    const length = Math.hypot(x2 - x1, y2 - y1)
    segmentLengths.push(length)
    total += length
  }
  if (total === 0) return points

  const step = total / count
  const output: OutlinePoint[] = []
  let distance = 0
  let segment = 0
  let travelled = 0

  for (let index = 0; index < count; index++) {
    while (segment < segmentLengths.length && travelled + segmentLengths[segment] < distance) {
      travelled += segmentLengths[segment]
      segment++
    }
    const [x1, y1] = closed[Math.min(segment, closed.length - 2)]
    const [x2, y2] = closed[Math.min(segment + 1, closed.length - 1)]
    const t = segmentLengths[segment] ? (distance - travelled) / segmentLengths[segment] : 0
    output.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t])
    distance += step
  }

  return output
}

/** Resample an OPEN polyline to `count` points, evenly spaced by arc length —
 *  endpoints preserved (the open sibling of `resampleClosed`). */
export const resampleOpen = (points: OutlinePoint[], count = 48): OutlinePoint[] => {
  if (points.length < 2 || count < 2) return points

  const segmentLengths: number[] = []
  let total = 0
  for (let index = 0; index + 1 < points.length; index++) {
    const [x1, y1] = points[index]
    const [x2, y2] = points[index + 1]
    const length = Math.hypot(x2 - x1, y2 - y1)
    segmentLengths.push(length)
    total += length
  }
  if (total === 0) return points

  const step = total / (count - 1)
  const output: OutlinePoint[] = [points[0]]
  let distance = step
  let segment = 0
  let travelled = 0

  for (let index = 1; index < count - 1; index++) {
    while (segment < segmentLengths.length && travelled + segmentLengths[segment] < distance) {
      travelled += segmentLengths[segment]
      segment++
    }
    const [x1, y1] = points[Math.min(segment, points.length - 2)]
    const [x2, y2] = points[Math.min(segment + 1, points.length - 1)]
    const t = segmentLengths[segment] ? (distance - travelled) / segmentLengths[segment] : 0
    output.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t])
    distance += step
  }

  output.push(points[points.length - 1])
  return output
}

/** Arc length of an open polyline. */
export const polylineLength = (points: OutlinePoint[]): number => {
  let total = 0
  for (let index = 0; index + 1 < points.length; index++) {
    total += Math.hypot(
      points[index + 1][0] - points[index][0],
      points[index + 1][1] - points[index][1]
    )
  }
  return total
}

/** Vertex identity that survives the map generator's 2-decimal output. */
const vertexKey = ([x, y]: OutlinePoint): string => `${x.toFixed(2)},${y.toFixed(2)}`

/**
 * Which of `ring`'s vertices lie on `neighbour` — the one mask behind
 * `sharedBoundary` and `unsharedRuns`, so the extracted border and the drawn
 * coasts partition the ring identically. Bridges 1–2 vertex gaps:
 * simplification occasionally drops a border vertex on one side only,
 * splitting one real border into runs (France–Spain).
 */
const sharedVertexMask = (ring: OutlinePoint[], neighbour: OutlinePoint[]): boolean[] => {
  const neighbourKeys = new Set(neighbour.map(vertexKey))
  const count = ring.length
  const shared = ring.map(point => neighbourKeys.has(vertexKey(point)))
  if (!shared.includes(false) || !shared.includes(true)) return shared

  for (let index = 0; index < count; index++) {
    if (shared[index]) continue
    const previous = shared[(index - 1 + count) % count]
    const next = shared[(index + 1) % count]
    const afterNext = shared[(index + 2) % count]
    if (previous && (next || afterNext)) shared[index] = true
  }
  return shared
}

/**
 * The shared border between two adjacent rings: the longest contiguous run
 * (wrap-aware) of `ring`'s vertices that also lie on `neighbour`. Reliable
 * because the map generator simplifies topologically — a border keeps
 * identical vertices on both of its countries.
 */
export const sharedBoundary = (
  ring: OutlinePoint[],
  neighbour: OutlinePoint[]
): OutlinePoint[] | undefined => {
  const count = ring.length
  const shared = sharedVertexMask(ring, neighbour)
  if (!shared.includes(false)) return [...ring]

  let best = { start: -1, length: 0 }
  let start = -1
  let length = 0
  for (let index = 0; index < 2 * count; index++) {
    if (shared[index % count]) {
      if (start < 0) start = index
      length++
      if (length > best.length) best = { start, length }
    } else {
      start = -1
      length = 0
    }
  }
  if (best.length < 2) return undefined

  const run: OutlinePoint[] = []
  for (let index = 0; index < Math.min(best.length, count); index++) {
    run.push(ring[(best.start + index) % count])
  }
  return run
}

/**
 * The complement of `sharedBoundary` on one ring: the contiguous stretches of
 * `ring` NOT shared with `neighbour` — its own coastline and outer borders.
 * Each run is extended one vertex into the shared border on both ends so
 * strokes meet the junction instead of stopping short of it.
 */
export const unsharedRuns = (ring: OutlinePoint[], neighbour: OutlinePoint[]): OutlinePoint[][] => {
  const count = ring.length
  const shared = sharedVertexMask(ring, neighbour)
  if (!shared.includes(true)) return [[...ring, ring[0]]]
  if (!shared.includes(false)) return []

  // Walk from a shared vertex so every unshared run is seen exactly once
  const anchor = shared.indexOf(true)
  const runs: OutlinePoint[][] = []
  let current: OutlinePoint[] | undefined
  for (let offset = 0; offset <= count; offset++) {
    const index = (anchor + offset) % count
    if (shared[index]) {
      if (current) {
        current.push(ring[index])
        runs.push(current)
        current = undefined
      }
    } else {
      current ??= [ring[(anchor + offset - 1 + count) % count]]
      current.push(ring[index])
    }
  }
  if (current) {
    current.push(ring[anchor])
    runs.push(current)
  }
  return runs
}

/**
 * Blended deviation between two open polylines, in the input units: the mean
 * symmetric nearest-point distance blended with the 85th-percentile miss.
 * Same philosophy as `scoreSketch` — the mean alone flatters a token stub
 * ("near the border somewhere"); the tail demands the whole line shows up.
 */
export const boundaryDeviation = (drawn: OutlinePoint[], target: OutlinePoint[]): number => {
  const a = resampleOpen(drawn)
  const b = resampleOpen(target)
  if (a.length < 2 || b.length < 2) return Infinity

  const nearestDistances = (from: OutlinePoint[], to: OutlinePoint[]) =>
    from.map(([x1, y1]) => {
      let nearest = Infinity
      for (const [x2, y2] of to) {
        nearest = Math.min(nearest, Math.hypot(x2 - x1, y2 - y1))
      }
      return nearest
    })

  const misses = [...nearestDistances(a, b), ...nearestDistances(b, a)]
  const mean = misses.reduce((sum, miss) => sum + miss, 0) / misses.length
  const worst = [...misses].sort((x, y) => x - y)[Math.floor(misses.length * 0.85)]
  return mean * 0.7 + worst * 0.3
}

/** Translate centroid to origin, scale the longer side to 1 — shape only. */
export const normalizeOutline = (points: OutlinePoint[]): OutlinePoint[] => {
  if (!points.length) return points

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  const [centerX, centerY] = ringCentroid(points)
  const scale = Math.max(maxX - minX, maxY - minY) || 1

  return points.map(([x, y]) => [(x - centerX) / scale, (y - centerY) / scale])
}

/**
 * Centroid + RMS-radius normalization ($1-recognizer style). Bounding-box
 * scaling lets one bulge rescale the whole drawing; RMS radius is stable, so
 * a sketch that's simply drawn a little large lines up with the target.
 */
const rmsNormalize = (points: OutlinePoint[]): OutlinePoint[] => {
  if (!points.length) return points
  const [centerX, centerY] = ringCentroid(points)

  let radius = 0
  for (const [x, y] of points) {
    radius += (x - centerX) ** 2 + (y - centerY) ** 2
  }
  const scale = Math.sqrt(radius / points.length) || 1

  return points.map(([x, y]) => [(x - centerX) / scale, (y - centerY) / scale])
}

/**
 * Moving-average smoothing over a closed ring. Real borders carry fractal
 * detail (fjords, deltas) no finger can trace; grading both shapes lightly
 * smoothed measures the gross form the player could actually reproduce.
 */
const smoothClosed = (points: OutlinePoint[], window = 3): OutlinePoint[] => {
  if (window <= 1 || points.length < window) return points
  const half = Math.floor(window / 2)
  const count = points.length
  return points.map((_, index) => {
    let sumX = 0
    let sumY = 0
    for (let offset = -half; offset <= half; offset++) {
      const [x, y] = points[(index + offset + count) % count]
      sumX += x
      sumY += y
    }
    return [sumX / window, sumY / window]
  })
}

/** Map a sketch's outline distance onto the round's point scale. */
export const scoreSketch = (
  drawn: OutlinePoint[],
  target: OutlinePoint[],
  maximumPoints: number
): number => {
  const a = rmsNormalize(smoothClosed(resampleClosed(drawn)))
  const b = rmsNormalize(smoothClosed(resampleClosed(target)))
  if (!a.length || !b.length) return 0

  const nearestDistances = (from: OutlinePoint[], to: OutlinePoint[]) =>
    from.map(([x1, y1]) => {
      let nearest = Infinity
      for (const [x2, y2] of to) {
        nearest = Math.min(nearest, Math.hypot(x2 - x1, y2 - y1))
      }
      return nearest
    })

  const blend = (candidate: OutlinePoint[]) => {
    const misses = [...nearestDistances(candidate, b), ...nearestDistances(b, candidate)]
    const mean = misses.reduce((sum, miss) => sum + miss, 0) / misses.length
    // Mean distance alone flatters featureless blobs — every point of an
    // oval is "near" a compact country's border. Blending in the 85th-
    // percentile miss demands the distinctive features actually show up,
    // without letting one forgotten peninsula sink the whole drawing.
    const worst = [...misses].sort((x, y) => x - y)[Math.floor(misses.length * 0.85)]
    return mean * 0.7 + worst * 0.3
  }

  // Alignment search: a hand drawing tilts a few degrees and squashes one
  // axis without the player meaning either — that is placement, not shape.
  // Shape mismatch survives every rotation and stretch in this window.
  let distance = Infinity
  for (const rotation of [-0.1, -0.05, 0, 0.05, 0.1]) {
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const rotated: OutlinePoint[] = a.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos])
    for (const scaleX of [0.92, 1, 1.08]) {
      for (const scaleY of [0.92, 1, 1.08]) {
        distance = Math.min(distance, blend(rotated.map(([x, y]) => [x * scaleX, y * scaleY])))
      }
    }
  }

  // Calibrated on simulated finger drawings of real outlines (RMS units):
  // careful sketches land 0.05–0.13, typical honest ones 0.07–0.16, rough
  // but recognizable 0.09–0.22; a bounding-box ellipse sits ≥0.18 on any
  // country with a distinctive shape, wrong-country tracings ≥0.20. Full
  // marks ≤0.07, nothing from 0.25 up.
  const band = clamp01(1 - (distance - 0.07) / 0.18)
  return Math.round(maximumPoints * Math.pow(band, 1.3))
}
