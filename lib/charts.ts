export interface ChartPoint {
  x: number
  y: number
}

/**
 * A smooth path through data points — monotone cubic (Fritsch–Carlson, the
 * curve d3 calls monotone-x): curved like a spline but never overshooting
 * the data, so a trajectory's highs and lows stay honest. The one curve
 * generator for every line chart; charts must not hand-roll polylines when
 * they mean a curve.
 */
export const monotoneCurvePath = (points: readonly ChartPoint[]): string => {
  if (!points.length) return ''
  if (points.length === 1) return `M ${round(points[0].x)},${round(points[0].y)}`

  // Segment slopes, then tangents that keep each segment monotone.
  const slopes: number[] = []
  for (let index = 0; index < points.length - 1; index++) {
    const dx = points[index + 1].x - points[index].x
    slopes.push(dx === 0 ? 0 : (points[index + 1].y - points[index].y) / dx)
  }

  const tangents: number[] = [slopes[0]]
  for (let index = 1; index < points.length - 1; index++) {
    const previous = slopes[index - 1]
    const next = slopes[index]
    // A local extremum gets a flat tangent; otherwise the harmonic mean
    // keeps the curve inside the data (no bulging past a point).
    tangents.push(previous * next <= 0 ? 0 : (2 * previous * next) / (previous + next))
  }
  tangents.push(slopes[slopes.length - 1])

  let path = `M ${round(points[0].x)},${round(points[0].y)}`
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index]
    const to = points[index + 1]
    const dx = (to.x - from.x) / 3
    path +=
      ` C ${round(from.x + dx)},${round(from.y + tangents[index] * dx)}` +
      ` ${round(to.x - dx)},${round(to.y - tangents[index + 1] * dx)}` +
      ` ${round(to.x)},${round(to.y)}`
  }
  return path
}

const round = (value: number): string => value.toFixed(2)
