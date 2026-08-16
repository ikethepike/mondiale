import type { Vector3 } from 'three'

/**
 * The one home for 2D (XZ) polyline math the landscape features share:
 * segment intersection for never-cross guarantees, and the Laplacian
 * low-pass every marched line is ironed with.
 */

const side = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) =>
  Math.sign((bx - ax) * (cz - az) - (bz - az) * (cx - ax))

export const segmentsIntersect = (a: Vector3, b: Vector3, c: Vector3, d: Vector3): boolean =>
  side(a.x, a.z, b.x, b.z, c.x, c.z) !== side(a.x, a.z, b.x, b.z, d.x, d.z) &&
  side(c.x, c.z, d.x, d.z, a.x, a.z) !== side(c.x, c.z, d.x, d.z, b.x, b.z)

/** Non-adjacent segment intersection over an OPEN polyline. */
export const lineCrossesItself = (points: Vector3[]): boolean => {
  for (let index = 0; index < points.length - 1; index++) {
    for (let other = index + 2; other < points.length - 1; other++) {
      if (segmentsIntersect(points[index], points[index + 1], points[other], points[other + 1]))
        return true
    }
  }
  return false
}

/** Non-adjacent segment intersection over a CLOSED XZ polygon. */
export const loopCrossesItself = (points: Vector3[]): boolean =>
  points.some((a, index) => {
    const b = points[(index + 1) % points.length]
    return points.some((c, otherIndex) => {
      const gap = Math.min(
        Math.abs(index - otherIndex),
        points.length - Math.abs(index - otherIndex)
      )
      if (gap < 2) return false
      const d = points[(otherIndex + 1) % points.length]
      return segmentsIntersect(a, b, c, d)
    })
  })

/** Any segment of one open polyline crossing any segment of another. */
export const polylinesIntersect = (points: Vector3[], other: Vector3[]): boolean => {
  for (let index = 0; index < points.length - 1; index++) {
    for (let segment = 0; segment < other.length - 1; segment++) {
      if (segmentsIntersect(points[index], points[index + 1], other[segment], other[segment + 1]))
        return true
    }
  }
  return false
}

/**
 * The 0.5/0.25/0.25 Laplacian low-pass every marched line is graded with —
 * cut-and-fill. Ends always pinned; `isPinned` holds crossing corridors and
 * bridge decks exactly where they were walked.
 */
export const smoothPolyline = (
  points: Vector3[],
  rounds: number,
  axes: 'xz' | 'y',
  isPinned?: (point: Vector3) => boolean
): void => {
  for (let round = 0; round < rounds; round++) {
    for (let index = 1; index < points.length - 1; index++) {
      const point = points[index]
      if (isPinned?.(point)) continue
      const previous = points[index - 1]
      const next = points[index + 1]
      if (axes === 'xz') {
        point.x = point.x * 0.5 + (previous.x + next.x) * 0.25
        point.z = point.z * 0.5 + (previous.z + next.z) * 0.25
      } else {
        point.y = point.y * 0.5 + (previous.y + next.y) * 0.25
      }
    }
  }
}
