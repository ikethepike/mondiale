import Alea from 'alea'
import { createNoise2D } from 'simplex-noise'
import type { Vector3 } from 'three'

/** Side length of the square board in world units. */
export const BOARD_SIZE = 100

/** Peak terrain elevation — kept gentle so contour lines stay sparse. */
export const MAX_ELEVATION = BOARD_SIZE * 0.07

export type HeightSampler = (x: number, z: number) => number

/**
 * Deterministic fBm height field seeded by the game id, so every player
 * sees the same landscape without any server involvement.
 * Returns elevations in [0, MAX_ELEVATION].
 */
export const createHeightSampler = (seed: string): HeightSampler => {
  const noise = createNoise2D(Alea(seed))

  const octaves = 4
  const lacunarity = 2
  const gain = 0.45
  const baseFrequency = 2.0 / BOARD_SIZE

  return (x, z) => {
    let amplitude = 1
    let frequency = baseFrequency
    let sum = 0
    let normalization = 0

    for (let octave = 0; octave < octaves; octave++) {
      sum += amplitude * noise(x * frequency, z * frequency)
      normalization += amplitude
      amplitude *= gain
      frequency *= lacunarity
    }

    return (sum / normalization) * 0.5 * MAX_ELEVATION + MAX_ELEVATION * 0.5
  }
}

const smoothstep = (t: number) => t * t * (3 - 2 * t)

/**
 * Blend the terrain toward the tile path's elevation within a falloff radius,
 * so the track sits on readable, gently shelved ground.
 */
export const withPathShelf = (
  sampler: HeightSampler,
  pathPoints: Vector3[],
  radius: number
): HeightSampler => {
  // Bounding box early-out: the landscape extends far past the track, and
  // most sampled vertices can skip the nearest-point scan entirely.
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const point of pathPoints) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minZ = Math.min(minZ, point.z)
    maxZ = Math.max(maxZ, point.z)
  }
  minX -= radius
  maxX += radius
  minZ -= radius
  maxZ += radius

  return (x, z) => {
    if (x < minX || x > maxX || z < minZ || z > maxZ) return sampler(x, z)

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
