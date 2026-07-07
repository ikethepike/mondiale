import type { ISOCountryCode } from '~~/types/geography.types'

export type OutlinePoint = [number, number]

/**
 * The country outlines live as SVG path data in the always-mounted world map.
 * Client-only by nature — callers run inside mounted components.
 */
export const countryPathData = (isoCode: ISOCountryCode): string | undefined =>
  document.querySelector(`.game-map path#${isoCode}`)?.getAttribute('d') ?? undefined

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

/** Map a sketch's outline distance onto the round's point scale. */
export const scoreSketch = (
  drawn: OutlinePoint[],
  target: OutlinePoint[],
  maximumPoints: number
): number => {
  const distance = outlineDistance(
    normalizeOutline(resampleClosed(drawn)),
    normalizeOutline(resampleClosed(target))
  )

  // ≤0.045 is a genuinely good sketch; ≥0.2 doesn't read as the country
  const quality = Math.max(0, Math.min(1, 1 - (distance - 0.045) / 0.155))
  return Math.round(maximumPoints * quality)
}
