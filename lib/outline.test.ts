import { describe, expect, it } from 'vitest'
import { largestRing, normalizeOutline, resampleClosed, scoreSketch } from './outline'
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
    return [
      x + Math.cos(angle * 3 + 1) * quality.wobble,
      y + Math.sin(angle * 2) * quality.wobble,
    ]
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
