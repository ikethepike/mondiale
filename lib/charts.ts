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

/**
 * Human-readable axis ticks across [min, max] — the 1/2/5/10 ladder, so a
 * domain of 1834–16001 reads 5k / 10k / 15k instead of raw thirds. `count` is
 * a target, not a promise: the ladder picks the real spacing, so the tick
 * count lands near it rather than on it. Ticks stay inside the domain — a
 * bounded metric's axis must never sprout a step past its own scale.
 */
export const niceTicks = (min: number, max: number, count = 3): number[] => {
  if (!Number.isFinite(min) || !Number.isFinite(max) || count < 2) return []
  if (max <= min) return [min]

  const rawStep = (max - min) / (count - 1)
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  // Walk the 1/2/5/10 ladder and keep the step whose tick count lands nearest
  // the target. Rounding UP alone overshoots a domain that cannot absorb the
  // next rung — 1834–16001 takes a 10k step and keeps one lonely tick, where
  // 5k reads 5k/10k/15k as the docstring promises.
  const tickCount = (candidate: number) =>
    Math.floor(max / candidate + 1e-9) - Math.ceil(min / candidate - 1e-9) + 1
  const step = [1, 2, 5, 10]
    .map(rung => rung * magnitude)
    .reduce((best, candidate) => {
      if (tickCount(candidate) < 2) return best
      return Math.abs(tickCount(candidate) - count) < Math.abs(tickCount(best) - count)
        ? candidate
        : best
    }, magnitude)

  const ticks: number[] = []
  const epsilon = step * 1e-9
  // Multiply out from the first tick rather than accumulating `+= step`: the
  // running sum is what leaves 0.6000000000000001 in place of the 0.6 that
  // must stay inside the domain. Snapping also cleans a near-zero to a true 0.
  const first = Math.ceil(min / step - 1e-9)
  for (let index = 0; first * step + index * step <= max + epsilon; index++) {
    const value = (first + index) * step
    ticks.push(Math.abs(value) < epsilon ? 0 : Number(value.toPrecision(12)))
  }
  return ticks
}
