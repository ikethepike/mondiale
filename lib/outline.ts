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

/** Is a point inside a closed ring? Even-odd crossing count. */
export const ringContains = (
  ring: readonly (readonly [number, number])[],
  [px, py]: OutlinePoint
): boolean => {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index]
    const [xj, yj] = ring[previous]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Distance from a point to a segment, clamped to the segment's ends. */
const segmentDistance = (
  px: number,
  py: number,
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number]
): number => {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared ? clamp01(((px - ax) * dx + (py - ay) * dy) / lengthSquared) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Distance to the ring's edge, negative outside it. */
const signedEdgeDistance = (ring: OutlinePoint[], px: number, py: number): number => {
  let nearest = Infinity
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    nearest = Math.min(nearest, segmentDistance(px, py, ring[index], ring[previous]))
  }
  return ringContains(ring, [px, py]) ? nearest : -nearest
}

/** Above this a ring is resampled before the anchor search. Measured over all
 *  219 mapped countries: 183ms for the whole sweep instead of 328ms, with no
 *  anchor landing outside its true outline and a median drift of 0.00 units. */
const ANCHOR_RING_POINTS = 128

/**
 * Where a country's name should sit: its pole of inaccessibility — the centre
 * of the largest circle that fits inside the ring — with that circle's radius.
 *
 * NOT the bounding-box centre and NOT the centroid. Both fall outside any
 * country that curves around another: Norway's box centre is in Sweden, and
 * the same holds for Sweden, Chile, Croatia and Vietnam. A label hung there
 * names the wrong country, which for the errata gate is the question breaking.
 *
 * `radius` is how much room the country has for a name, which is what tells a
 * placement pass whether the name fits on its own land or has to be moved off
 * it and given a leader line.
 */
export const poleOfInaccessibility = (
  ring: OutlinePoint[]
): { point: OutlinePoint; radius: number } | undefined => {
  if (ring.length < 3) return undefined
  const probe = ring.length > ANCHOR_RING_POINTS ? resampleClosed(ring, ANCHOR_RING_POINTS) : ring

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of probe) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  // Coarse grid for the basin, then a shrinking local walk for the peak — the
  // polylabel shape. A ring this size doesn't earn a priority queue.
  const cell = Math.min(maxX - minX, maxY - minY) / 8
  if (!(cell > 0)) return undefined
  let best: OutlinePoint = [(minX + maxX) / 2, (minY + maxY) / 2]
  let bestDistance = -Infinity
  for (let x = minX + cell / 2; x < maxX; x += cell) {
    for (let y = minY + cell / 2; y < maxY; y += cell) {
      const distance = signedEdgeDistance(probe, x, y)
      if (distance > bestDistance) {
        bestDistance = distance
        best = [x, y]
      }
    }
  }

  // The loop only shrinks its step when NO direction improves, so a ring that
  // keeps offering tiny gains could climb for a long time — on the client's
  // main thread. The guard trades a possible hang for a slightly coarser
  // anchor; real rings converge in a few dozen passes.
  const precision = cell / 64
  for (let step = cell / 2, guard = 0; step > precision && guard < ANCHOR_MAX_PASSES; guard++) {
    let climbed = false
    for (const [dx, dy] of ANCHOR_STEPS) {
      const x = best[0] + dx * step
      const y = best[1] + dy * step
      const distance = signedEdgeDistance(probe, x, y)
      if (distance > bestDistance) {
        bestDistance = distance
        best = [x, y]
        climbed = true
      }
    }
    if (!climbed) step /= 2
  }

  // A non-positive distance means the search never got inside the ring, so
  // `best` sits on someone else's land. Saying so lets the caller fall back to
  // its box centre; clamping the radius to 0 instead would hand back an anchor
  // that looks usable and is not.
  if (bestDistance <= 0) return undefined
  return { point: best, radius: bestDistance }
}

/** Hill-climb passes before the anchor is called good enough. */
const ANCHOR_MAX_PASSES = 200

const ANCHOR_STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const

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

/**
 * How a country's land would be divided between its neighbours if it ceased to
 * exist: one line from each border junction to a point deep inside it.
 *
 * Terra Incognita needs this because erasing a country is not enough to make
 * the map believable. A country's outline carries its neighbours' junctions,
 * and every border BETWEEN two of those neighbours terminates on it. Erase the
 * country and each of those borders is left amputated, ending bluntly in open
 * land — which reads as a rendering fault rather than as geography.
 *
 * Drawing the spokes closes them: the amputated ends now continue inward and
 * meet, so the territory reads as partitioned between the neighbours that
 * surround it, which is what would actually happen to it. A star through one
 * interior point is the honest general answer — with two neighbours it is
 * simply their border continuing across, and with more it is the same shape a
 * real three-way partition takes.
 *
 * The interior point is the pole of inaccessibility rather than the centroid,
 * so the spokes stay inside a concave country instead of cutting the corner.
 *
 * `neighbours` are vertex lists (rings may be flattened — only membership is
 * read). An enclave's host wraps the whole ring and yields no junction, which
 * is correct: nothing outside it changes when the country goes.
 */
/**
 * The longest border a ring shares with any one of its neighbours — returned as
 * BOTH sides of it: the run as the ring itself draws it, and the same border as
 * that neighbour draws it.
 *
 * Named for what it measures rather than what it is used for, because the
 * caller's reason is a mode's fiction and this is plain ring geometry.
 *
 * Both sides matter because a shared border is drawn twice, once by each
 * country, and the two copies are NOT identical: per-country simplification
 * moves them apart by a fraction of a map unit here and there. Anything
 * covering that border has to cover each copy along its own path — a single
 * brush centred on one country's version leaves the other's poking out as a
 * faint ghost of the line, and widening the brush until it spans the divergence
 * would swallow a sliver neighbour whole.
 *
 * Terra Incognita erases exactly this border to make a country vanish, and the
 * choice of ONE border is what keeps the map believable. Erasing a whole outline
 * amputates every border BETWEEN two of the country's neighbours: those lines
 * terminated on it, and without it they stop bluntly in open land. Erasing a
 * single shared border leaves every remaining line ending where it always did —
 * at its tripoints the two surviving borders simply continue into each other,
 * so the land closes over the gap instead of being left ringed by pointers to
 * it.
 *
 * The longest border is the one worth taking: it is the stretch along which the
 * two shapes merge most completely, so what is left reads as one plain piece of
 * land rather than as two shapes touching at a corner.
 *
 * Undefined when there is no partial border to give up — an island (no land
 * neighbour at all) or an enclave's host wrapping the whole ring, where erasing
 * the border would take the entire outline with it and land straight back on
 * the amputation problem.
 */
export const sharedBorderPair = (
  ring: OutlinePoint[],
  neighbours: OutlinePoint[][]
): { own: OutlinePoint[]; theirs: OutlinePoint[] } | undefined => {
  let best: { own: OutlinePoint[]; theirs: OutlinePoint[] } | undefined
  for (const neighbour of neighbours) {
    const own = sharedBoundary(ring, neighbour)
    if (!own || own.length < 2 || own.length >= ring.length) continue
    if (best && own.length <= best.own.length) continue
    // The same border as the neighbour draws it. Absent when the neighbour's
    // ring is entirely shared (it is enclosed by this country) — then its whole
    // outline is this border and its own copy needs no separate cover.
    const theirs = sharedBoundary(neighbour, ring)
    best = { own, theirs: theirs ?? [] }
  }
  return best
}
