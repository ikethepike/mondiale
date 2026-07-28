import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { createHeightSampler, type HeightSampler, withPathShelf } from './terrain'

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
