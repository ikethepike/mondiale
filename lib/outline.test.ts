import { describe, expect, it } from 'vitest'
import {
  boundaryDeviation,
  parsePolygons,
  partitionRing,
  DRAW_COMPLETE_AT,
  drawnFraction,
  largestRing,
  normalizeOutline,
  poleOfInaccessibility,
  polylineLength,
  previewSweepSeconds,
  resampleClosed,
  resampleOpen,
  ringContains,
  scoreSketch,
  sharedBoundary,
  unsharedRuns,
} from './outline'
import type { OutlinePoint } from './outline'
import { MAP_BOUNDS, MAP_PATHS, MAP_REGIONS } from '~~/data/map.gen'
import { labelBoxFor } from './geo'

// Grading calibration tests: honest finger drawings must earn real points,
// lazy blobs must not, and better drawings must always beat worse ones.

const ring = (code: keyof typeof MAP_PATHS): OutlinePoint[] => {
  const mainland = largestRing(MAP_PATHS[code])
  if (!mainland) throw new ReferenceError(`No ring for ${code}`)
  return mainland
}

const smooth = (points: OutlinePoint[], window: number): OutlinePoint[] => {
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

/**
 * A deterministic stand-in for a human drawing: heavy smoothing (fingers
 * cannot trace coastline detail), low-frequency wobble, a slight tilt and
 * an uneven stretch. Amplitudes are in normalized units (longer side = 1).
 */
const handDrawn = (
  target: OutlinePoint[],
  quality: { smooth: number; wobble: number; tilt: number; stretch: number }
): OutlinePoint[] => {
  const base = smooth(normalizeOutline(resampleClosed(target, 64)), quality.smooth)
  const count = base.length
  const wobbled: OutlinePoint[] = base.map(([x, y], index) => {
    const angle = (index / count) * Math.PI * 2
    return [x + Math.cos(angle * 3 + 1) * quality.wobble, y + Math.sin(angle * 2) * quality.wobble]
  })
  const cos = Math.cos(quality.tilt)
  const sin = Math.sin(quality.tilt)
  return wobbled.map(([x, y]) => [
    (x * cos - y * sin) * quality.stretch,
    (x * sin + y * cos) / quality.stretch,
  ])
}

const CAREFUL = { smooth: 5, wobble: 0.01, tilt: 0.04, stretch: 1.03 }
const TYPICAL = { smooth: 9, wobble: 0.02, tilt: 0.07, stretch: 1.06 }
const ROUGH = { smooth: 15, wobble: 0.035, tilt: 0.12, stretch: 1.1 }

const circle = (points = 64): OutlinePoint[] =>
  Array.from({ length: points }, (_, index) => {
    const angle = (index / points) * Math.PI * 2
    return [Math.cos(angle), Math.sin(angle)]
  })

describe('scoreSketch', () => {
  it('pays full marks for a perfect tracing', () => {
    for (const code of ['FR', 'IT', 'JP'] as const) {
      expect(scoreSketch(ring(code), ring(code), 20)).toBe(20)
    }
  })

  it('pays nothing for an empty drawing', () => {
    expect(scoreSketch([], ring('FR'), 20)).toBe(0)
  })

  it('pays a careful hand drawing most of the pot', () => {
    for (const code of ['FR', 'IT', 'BR', 'SE'] as const) {
      const scored = scoreSketch(handDrawn(ring(code), CAREFUL), ring(code), 100)
      expect(scored, code).toBeGreaterThanOrEqual(70)
    }
  })

  it('pays a typical honest drawing at least half the pot', () => {
    for (const code of ['FR', 'IT', 'BR', 'SE'] as const) {
      const scored = scoreSketch(handDrawn(ring(code), TYPICAL), ring(code), 100)
      expect(scored, code).toBeGreaterThanOrEqual(50)
    }
  })

  it('still pays a rough but recognizable drawing', () => {
    for (const code of ['FR', 'IT', 'BR', 'SE'] as const) {
      const scored = scoreSketch(handDrawn(ring(code), ROUGH), ring(code), 100)
      expect(scored, code).toBeGreaterThanOrEqual(25)
    }
  })

  it('never lets a worse drawing beat a better one', () => {
    for (const code of ['FR', 'IT', 'BR', 'SE'] as const) {
      const careful = scoreSketch(handDrawn(ring(code), CAREFUL), ring(code), 100)
      const typical = scoreSketch(handDrawn(ring(code), TYPICAL), ring(code), 100)
      const rough = scoreSketch(handDrawn(ring(code), ROUGH), ring(code), 100)
      expect(careful, code).toBeGreaterThanOrEqual(typical)
      expect(typical, code).toBeGreaterThanOrEqual(rough)
    }
  })

  it('pays a lazy circle almost nothing on distinctive shapes', () => {
    for (const code of ['IT', 'NO', 'CL', 'JP'] as const) {
      expect(scoreSketch(circle(), ring(code), 100), code).toBeLessThanOrEqual(5)
    }
  })

  it('pays a wrong-country tracing almost nothing', () => {
    expect(scoreSketch(ring('SE'), ring('IT'), 100)).toBeLessThanOrEqual(10)
    // Brazil and Australia are both wide compact blobs — a sliver of credit
    // for a genuinely confusable silhouette is fine, a real payout is not.
    expect(scoreSketch(ring('BR'), ring('AU'), 100)).toBeLessThanOrEqual(15)
    expect(scoreSketch(ring('EG'), ring('CL'), 100)).toBeLessThanOrEqual(10)
  })
})

// Open-polyline geometry: the Boundary Commission's shared-border machinery.

describe('resampleOpen', () => {
  it('preserves the endpoints and the requested count', () => {
    const line: OutlinePoint[] = [
      [0, 0],
      [4, 0],
      [4, 3],
    ]
    const resampled = resampleOpen(line, 15)
    expect(resampled.length).toBe(15)
    expect(resampled[0]).toEqual([0, 0])
    expect(resampled[14]).toEqual([4, 3])
  })

  it('spaces points evenly by arc length', () => {
    const line: OutlinePoint[] = [
      [0, 0],
      [10, 0],
    ]
    const resampled = resampleOpen(line, 11)
    for (let index = 0; index < resampled.length; index++) {
      expect(resampled[index][0]).toBeCloseTo(index, 6)
      expect(resampled[index][1]).toBeCloseTo(0, 6)
    }
  })
})

describe('polylineLength', () => {
  it('sums the segment lengths of an open line', () => {
    expect(
      polylineLength([
        [0, 0],
        [3, 4],
        [3, 14],
      ])
    ).toBe(15)
  })
})

describe('sharedBoundary', () => {
  // The map generator simplifies topologically — the shared border keeps
  // identical vertices on both countries' rings.
  it('finds a substantial shared run for real land neighbours', () => {
    for (const [a, b] of [
      ['FR', 'ES'],
      ['KZ', 'UZ'],
      ['NO', 'SE'],
      ['IN', 'PK'],
    ] as const) {
      const ringA = largestRing(MAP_PATHS[a])!
      const ringB = largestRing(MAP_PATHS[b])!
      const line = sharedBoundary(ringA, ringB)
      expect(line, `${a}-${b}`).toBeDefined()
      expect(line!.length, `${a}-${b}`).toBeGreaterThanOrEqual(8)

      // The border lies on both rings, bar the odd bridged 1–2 vertex gap
      // where simplification dropped a vertex on one side only
      const keys = new Set(ringB.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`))
      const offRing = line!.filter(([x, y]) => !keys.has(`${x.toFixed(2)},${y.toFixed(2)}`))
      expect(offRing.length, `${a}-${b}`).toBeLessThanOrEqual(2)
    }
  })

  it('finds nothing between countries that never touch', () => {
    const france = largestRing(MAP_PATHS.FR)!
    const japan = largestRing(MAP_PATHS.JP)!
    expect(sharedBoundary(france, japan)).toBeUndefined()
  })
})

describe('unsharedRuns', () => {
  it('returns the whole ring when nothing is shared', () => {
    const france = largestRing(MAP_PATHS.FR)!
    const japan = largestRing(MAP_PATHS.JP)!
    const runs = unsharedRuns(france, japan)
    expect(runs.length).toBe(1)
    expect(runs[0].length).toBe(france.length + 1)
  })

  it('covers the ring minus the border, junctions included', () => {
    const france = largestRing(MAP_PATHS.FR)!
    const spain = largestRing(MAP_PATHS.ES)!
    const border = sharedBoundary(france, spain)!
    const runs = unsharedRuns(france, spain)
    expect(runs.length).toBeGreaterThan(0)

    // Each coast run starts and ends on a SHARED vertex (the junction
    // extension), so the stroked outline meets the erased line's endpoints
    const sharedKeys = new Set(spain.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`))
    const total = runs.reduce((sum, run) => sum + run.length, 0)
    expect(total).toBeGreaterThan(france.length - border.length)
    for (const run of runs) {
      const [firstX, firstY] = run[0]
      const [lastX, lastY] = run[run.length - 1]
      expect(sharedKeys.has(`${firstX.toFixed(2)},${firstY.toFixed(2)}`)).toBe(true)
      expect(sharedKeys.has(`${lastX.toFixed(2)},${lastY.toFixed(2)}`)).toBe(true)
    }
  })
})

describe('boundaryDeviation', () => {
  const target: OutlinePoint[] = Array.from({ length: 20 }, (_, index) => [index, 0])

  it('is zero for a perfect tracing', () => {
    expect(boundaryDeviation(target, target)).toBeCloseTo(0, 6)
  })

  it('grows with lateral offset', () => {
    const near = target.map(([x, y]): OutlinePoint => [x, y + 0.5])
    const far = target.map(([x, y]): OutlinePoint => [x, y + 3])
    expect(boundaryDeviation(near, target)).toBeLessThan(boundaryDeviation(far, target))
    expect(boundaryDeviation(near, target)).toBeCloseTo(0.5, 1)
  })

  it('punishes a token stub harder than its own mean distance', () => {
    // A stub sits ON the line — pointwise it misses by nothing — but the
    // uncovered remainder of the target must dominate through the blend
    const stub: OutlinePoint[] = [
      [0, 0],
      [3, 0],
    ]
    expect(boundaryDeviation(stub, target)).toBeGreaterThan(3)
  })

  it('is direction-agnostic', () => {
    const reversed = [...target].reverse()
    expect(boundaryDeviation(reversed, target)).toBeCloseTo(0, 6)
  })
})

// Reveal pacing: the outline modes' preview sweep and clock-synced draw.

const perimeter = (points: OutlinePoint[]): number => {
  let total = 0
  for (let index = 0; index < points.length; index++) {
    const [x1, y1] = points[index]
    const [x2, y2] = points[(index + 1) % points.length]
    total += Math.hypot(x2 - x1, y2 - y1)
  }
  return total
}

const ringSpan = (points: OutlinePoint[]): number => {
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
  return Math.max(maxX - minX, maxY - minY)
}

describe('previewSweepSeconds', () => {
  it('stays within its bounds for any geometry', () => {
    expect(previewSweepSeconds(0, 0)).toBeGreaterThanOrEqual(0.7)
    expect(previewSweepSeconds(1, 1000)).toBeGreaterThanOrEqual(0.7)
    expect(previewSweepSeconds(1_000_000, 1)).toBeLessThanOrEqual(2.4)
  })

  it('gives an intricate coastline a longer sweep than a compact one', () => {
    const norway = ring('NO')
    const egypt = ring('EG')
    const intricate = previewSweepSeconds(perimeter(norway), ringSpan(norway))
    const compact = previewSweepSeconds(perimeter(egypt), ringSpan(egypt))
    expect(intricate).toBeGreaterThan(compact)
  })
})

describe('drawnFraction', () => {
  it('starts at zero where the preview handed over', () => {
    expect(drawnFraction(26, 30, 26)).toBe(0)
  })

  it('completes exactly when the study beat begins, for any hand-over point', () => {
    for (const drawStart of [30, 26, 20]) {
      const studyBeat = 30 * (1 - DRAW_COMPLETE_AT)
      expect(drawnFraction(studyBeat, 30, drawStart)).toBe(1)
      expect(drawnFraction(0, 30, drawStart)).toBe(1)
    }
  })

  it('grows monotonically as the clock runs down', () => {
    let previous = -1
    for (let secondsLeft = 26; secondsLeft >= 0; secondsLeft--) {
      const drawn = drawnFraction(secondsLeft, 30, 26)
      expect(drawn).toBeGreaterThanOrEqual(previous)
      previous = drawn
    }
  })

  it('completes exactly at zero when completeAt is 1 — the closing line is the deadline', () => {
    expect(drawnFraction(0, 25, 22, 1)).toBe(1)
    expect(drawnFraction(1, 25, 22, 1)).toBeLessThan(1)
  })
})

describe('poleOfInaccessibility', () => {
  // The bounding-box centre — what the map hung its labels on — lands outside
  // any country that curves around another. These five are the ones that bite.
  const BOX_CENTRE_MISSES = ['NO', 'SE', 'CL', 'HR', 'VN'] as const

  // The anchor the map used before: the centre of `labelBoxFor`'s rectangle.
  const boxCentre = (code: keyof typeof MAP_PATHS): OutlinePoint => {
    const box = labelBoxFor(MAP_BOUNDS[code], MAP_REGIONS[code])
    if (!box) throw new ReferenceError(`No box for ${code}`)
    return [box[0] + box[2] / 2, box[1] + box[3] / 2]
  }

  it('rescues the countries whose box centre is on a neighbour', () => {
    for (const code of BOX_CENTRE_MISSES) {
      const mainland = ring(code)
      // Guard the premise: if this ever stops being outside, the case is stale.
      expect(ringContains(mainland, boxCentre(code)), `${code} box centre`).toBe(false)
      const anchor = poleOfInaccessibility(mainland)
      expect(anchor, `${code} has no anchor`).toBeTruthy()
      expect(ringContains(mainland, anchor!.point), `${code} anchor`).toBe(true)
    }
  })

  it('anchors every mapped country inside its own outline', () => {
    // Judged against the FULL-resolution ring, not the resampled one the
    // search runs on — the shortcut has to survive the real geometry.
    const adrift: string[] = []
    for (const code of Object.keys(MAP_PATHS) as (keyof typeof MAP_PATHS)[]) {
      const mainland = largestRing(MAP_PATHS[code])
      if (!mainland || mainland.length < 3) continue
      const anchor = poleOfInaccessibility(mainland)
      if (!anchor || !ringContains(mainland, anchor.point)) adrift.push(code)
    }
    expect(adrift).toEqual([])
  })

  it('reports the room a country has, so a placement pass can tell them apart', () => {
    const roomFor = (code: keyof typeof MAP_PATHS) => poleOfInaccessibility(ring(code))!.radius
    // Russia can hold a name outright; Estonia cannot, and must be moved.
    expect(roomFor('RU')).toBeGreaterThan(roomFor('EE') * 5)
    expect(roomFor('EE')).toBeGreaterThan(0)
  })
})

describe('partitionRing', () => {
  const ring = (code: keyof typeof MAP_PATHS) => largestRing(MAP_PATHS[code])!
  const key = ([x, y]: OutlinePoint) => `${x.toFixed(2)},${y.toFixed(2)}`

  it('keeps the whole ring when nothing is shared', () => {
    const { kept, shared } = partitionRing(ring('FR'), [ring('JP')])
    expect(shared).toEqual([])
    expect(kept).toHaveLength(1)
    expect(kept[0]).toHaveLength(ring('FR').length + 1)
  })

  it('agrees with the pairwise helpers against one neighbour', () => {
    const france = ring('FR')
    const spain = ring('ES')
    const { kept, shared } = partitionRing(france, [spain])
    expect(kept).toEqual(unsharedRuns(france, spain))
    // The shared side carries the border sharedBoundary finds, junctions included.
    const border = new Set(sharedBoundary(france, spain)!.map(key))
    const sharedKeys = new Set(shared.flat().map(key))
    for (const vertex of border) expect(sharedKeys.has(vertex)).toBe(true)
  })

  it('erases every neighbour at once — Germany over Austria and Poland', () => {
    // A pairwise fusion would draw the Polish border back through the Austrian
    // pair and vice versa; the plural partition drops both from the kept side.
    const germany = ring('DE')
    const austria = ring('AT')
    const poland = ring('PL')
    const { kept, shared } = partitionRing(germany, [austria, poland])
    const keptKeys = new Set(kept.flat().map(key))
    for (const border of [sharedBoundary(germany, austria)!, sharedBoundary(germany, poland)!]) {
      // Interior vertices of an erased border never appear on the kept side —
      // only the junction vertex each kept run is extended to.
      const interior = border.slice(1, -1)
      expect(interior.length).toBeGreaterThan(2)
      expect(interior.filter(point => keptKeys.has(key(point))).length).toBeLessThanOrEqual(1)
    }
    expect(shared.length).toBeGreaterThanOrEqual(2)
  })

  it('partitions the ring exactly: every vertex lands on one side or the other', () => {
    const germany = ring('DE')
    const { kept, shared } = partitionRing(germany, [ring('AT'), ring('DK'), ring('PL')])
    const seen = new Set([...kept.flat(), ...shared.flat()].map(key))
    for (const point of germany) expect(seen.has(key(point))).toBe(true)
  })

  it('surrenders the whole ring to a host that wraps it', () => {
    // The hole Lesotho sits in is one of South Africa's rings, not its largest.
    const host = parsePolygons(MAP_PATHS.ZA).flat()
    const { kept, shared } = partitionRing(ring('LS'), [host])
    expect(kept).toEqual([])
    expect(shared).toHaveLength(1)
  })
})
