import type { ISOCountryCode } from '~~/types/geography.types'

export type OutlinePoint = [number, number]

/**
 * The country outlines live as SVG path data in the always-mounted world map.
 * Client-only by nature — callers run inside mounted components.
 */
export const countryPathData = (isoCode: ISOCountryCode): string | undefined =>
  document.querySelector(`.game-map path#${isoCode}`)?.getAttribute('d') ?? undefined

/** Stroke width as a share of the frame — the classic hairline at stage size. */
const STROKE_WIDTH_RATIO = 0.0045

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
 * DRAW_COMPLETE_AT of the round.
 */
export const drawnFraction = (
  secondsLeft: number,
  totalSeconds: number,
  drawStartSecondsLeft: number
): number => {
  const drawEndsAt = totalSeconds * (1 - DRAW_COMPLETE_AT)
  const window = Math.max(1, drawStartSecondsLeft - drawEndsAt)
  return Math.min(1, Math.max(0, (drawStartSecondsLeft - secondsLeft) / window))
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

const ringArea = (ring: OutlinePoint[]): number => {
  let area = 0
  for (let index = 0; index < ring.length; index++) {
    const [x1, y1] = ring[index]
    const [x2, y2] = ring[(index + 1) % ring.length]
    area += x1 * y2 - x2 * y1
  }
  return Math.abs(area / 2)
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

/** Translate centroid to origin, scale the longer side to 1 — shape only. */
export const normalizeOutline = (points: OutlinePoint[]): OutlinePoint[] => {
  if (!points.length) return points

  let sumX = 0
  let sumY = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    sumX += x
    sumY += y
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  const centerX = sumX / points.length
  const centerY = sumY / points.length
  const scale = Math.max(maxX - minX, maxY - minY) || 1

  return points.map(([x, y]) => [(x - centerX) / scale, (y - centerY) / scale])
}

/**
 * Crude-sketch similarity in the $1-recognizer family: symmetric mean
 * nearest-point distance between two normalized, resampled closed shapes.
 * Returns a distance in normalized units (~0.03 great, ~0.2 unrecognizable).
 */
export const outlineDistance = (a: OutlinePoint[], b: OutlinePoint[]): number => {
  if (!a.length || !b.length) return Infinity

  const meanNearest = (from: OutlinePoint[], to: OutlinePoint[]) => {
    let total = 0
    for (const [x1, y1] of from) {
      let nearest = Infinity
      for (const [x2, y2] of to) {
        nearest = Math.min(nearest, Math.hypot(x2 - x1, y2 - y1))
      }
      total += nearest
    }
    return total / from.length
  }

  return (meanNearest(a, b) + meanNearest(b, a)) / 2
}

/**
 * Centroid + RMS-radius normalization ($1-recognizer style). Bounding-box
 * scaling lets one bulge rescale the whole drawing; RMS radius is stable, so
 * a sketch that's simply drawn a little large lines up with the target.
 */
const rmsNormalize = (points: OutlinePoint[]): OutlinePoint[] => {
  if (!points.length) return points
  let sumX = 0
  let sumY = 0
  for (const [x, y] of points) {
    sumX += x
    sumY += y
  }
  const centerX = sumX / points.length
  const centerY = sumY / points.length

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
  const band = Math.max(0, Math.min(1, 1 - (distance - 0.07) / 0.18))
  return Math.round(maximumPoints * Math.pow(band, 1.3))
}
