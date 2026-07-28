import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  createHeightSampler,
  EDGE_FADE_END,
  EDGE_FADE_START,
  type HeightSampler,
  MAX_ELEVATION,
  withEdgeFalloff,
  withPathShelf,
} from './terrain'

const smoothstep = (t: number) => t * t * (3 - 2 * t)

/** The pre-grid implementation: full linear scan over every path point. */
const bruteForceShelf = (
  sampler: HeightSampler,
  pathPoints: Vector3[],
  radius: number
): HeightSampler => {
  return (x, z) => {
    let nearestSquared = Infinity
    let pathY = 0
    for (const point of pathPoints) {
      const dx = point.x - x
      const dz = point.z - z
      const distanceSquared = dx * dx + dz * dz
      if (distanceSquared < nearestSquared) {
        nearestSquared = distanceSquared
        pathY = point.y
      }
    }
    const height = sampler(x, z)
    const distance = Math.sqrt(nearestSquared)
    if (distance >= radius) return height
    const t = smoothstep(distance / radius)
    return pathY * (1 - t) + height * t
  }
}

describe('withPathShelf', () => {
  const sampler = createHeightSampler('terrain-test')
  // A wandering path with clustered and isolated stretches
  const pathPoints = [...Array(160)].map((_, index) => {
    const t = index / 159
    return new Vector3(
      Math.sin(t * Math.PI * 4) * 40,
      sampler(Math.sin(t * Math.PI * 4) * 40, t * 80 - 40),
      t * 80 - 40
    )
  })
  const radius = 4.2

  it('matches the brute-force scan exactly across the field', () => {
    const gridded = withPathShelf(sampler, pathPoints, radius)
    const reference = bruteForceShelf(sampler, pathPoints, radius)

    // Probe a lattice spanning path, near-path and far-out terrain
    for (let x = -60; x <= 60; x += 3.7) {
      for (let z = -60; z <= 60; z += 3.7) {
        expect(gridded(x, z)).toBe(reference(x, z))
      }
    }
  })

  it('falls back to the raw sampler far from the path', () => {
    const gridded = withPathShelf(sampler, pathPoints, radius)
    expect(gridded(500, 500)).toBe(sampler(500, 500))
  })
})

describe('withEdgeFalloff', () => {
  const sampler = createHeightSampler('edge-test')
  const faded = withEdgeFalloff(sampler)
  const restY = MAX_ELEVATION * 0.5

  it('leaves the playfield untouched', () => {
    for (const [x, z] of [
      [0, 0],
      [40, -30],
      [-60, 50],
      [EDGE_FADE_START - 1, 0],
    ]) {
      expect(faded(x, z)).toBe(sampler(x, z))
    }
  })

  it('rests at the fBm mean beyond the band', () => {
    expect(faded(EDGE_FADE_END, 0)).toBe(restY)
    expect(faded(-120, 90)).toBe(restY)
  })

  it('blends between height and rest inside the band', () => {
    const mid = (EDGE_FADE_START + EDGE_FADE_END) / 2
    const value = faded(mid, 0)
    const base = sampler(mid, 0)
    const [low, high] = base < restY ? [base, restY] : [restY, base]
    expect(value).toBeGreaterThanOrEqual(low)
    expect(value).toBeLessThanOrEqual(high)
  })
})
