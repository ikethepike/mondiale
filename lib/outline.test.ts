import { describe, expect, it } from 'vitest'
import {
  DRAW_COMPLETE_AT,
  drawnFraction,
  largestRing,
  normalizeOutline,
  previewSweepSeconds,
  resampleClosed,
  scoreSketch,
} from './outline'
import type { OutlinePoint } from './outline'
import { MAP_PATHS } from '~~/data/map.gen'

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
