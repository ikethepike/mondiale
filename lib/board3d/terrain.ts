import Alea from 'alea'
import { createNoise2D } from 'simplex-noise'
import type { Vector3 } from 'three'
import type { BoardBiome } from './biomes'

/** The slice of a biome that shapes the LAND (not its colors). */
export type TerrainCharacter = Pick<BoardBiome, 'frequency' | 'stretch' | 'hilliness'>

/** Side length of the square board in world units. */
export const BOARD_SIZE = 100

/** Peak terrain elevation — kept gentle so contour lines stay sparse. */
export const MAX_ELEVATION = BOARD_SIZE * 0.07

/** Radial band over which the world melts into the page: contour lines fade
 *  (shader), hills subside and the warm tint drains (geometry + shader) —
 *  one shared pair so the two treatments can never drift apart. */
export const EDGE_FADE_START = 85
export const EDGE_FADE_END = 130

export type HeightSampler = (x: number, z: number) => number

/**
 * Deterministic fBm height field seeded by the game id, so every player
 * sees the same landscape without any server involvement.
 * Returns elevations in [0, MAX_ELEVATION].
 */
export const createHeightSampler = (seed: string, character?: TerrainCharacter): HeightSampler => {
  const noise = createNoise2D(Alea(seed))
  const { frequency: frequencyScale = 1, stretch = 1, hilliness = 1 } = character ?? {}

  const octaves = 4
  const lacunarity = 2
  const gain = 0.45
  const baseFrequency = (2.0 / BOARD_SIZE) * frequencyScale

  return (x, z) => {
    let amplitude = 1
    let frequency = baseFrequency
    let sum = 0
    let normalization = 0

    for (let octave = 0; octave < octaves; octave++) {
      // `stretch` elongates the noise along x — dune grain on desert boards.
      sum += amplitude * noise((x * frequency) / stretch, z * frequency)
      normalization += amplitude
      amplitude *= gain
      frequency *= lacunarity
    }

    return (sum / normalization) * 0.5 * MAX_ELEVATION * hilliness + MAX_ELEVATION * 0.5
  }
}

export const smoothstep = (t: number) => t * t * (3 - 2 * t)

/**
 * Subside the hills toward the fBm mean across the edge-fade band, so the
 * terrain's silhouette flattens into a plain instead of ending in a hard
 * sliced-off horizon at the plane border.
 */
export const withEdgeFalloff = (sampler: HeightSampler): HeightSampler => {
  const restY = MAX_ELEVATION * 0.5
  return (x, z) => {
    const distance = Math.hypot(x, z)
    if (distance <= EDGE_FADE_START) return sampler(x, z)
    if (distance >= EDGE_FADE_END) return restY

    const t = smoothstep((distance - EDGE_FADE_START) / (EDGE_FADE_END - EDGE_FADE_START))
    return sampler(x, z) * (1 - t) + restY * t
  }
}

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

  // Uniform grid over the path points, cell size = radius: every point within
  // `radius` of a query lives in the query's 3×3 cell neighbourhood, so the
  // nearest-in-neighbourhood IS the global nearest whenever it matters
  // (distance < radius) — identical output to a full scan, at O(1) per query.
  const grid = new Map<string, Vector3[]>()
  const cellOf = (value: number) => Math.floor(value / radius)
  for (const point of pathPoints) {
    const key = `${cellOf(point.x)},${cellOf(point.z)}`
    const bucket = grid.get(key)
    if (bucket) bucket.push(point)
    else grid.set(key, [point])
  }

  return (x, z) => {
    if (x < minX || x > maxX || z < minZ || z > maxZ) return sampler(x, z)

    let nearestSquared = Infinity
    let pathY = 0

    const cellX = cellOf(x)
    const cellZ = cellOf(z)
    for (let gridX = cellX - 1; gridX <= cellX + 1; gridX++) {
      for (let gridZ = cellZ - 1; gridZ <= cellZ + 1; gridZ++) {
        const bucket = grid.get(`${gridX},${gridZ}`)
        if (!bucket) continue
        for (const point of bucket) {
          const dx = point.x - x
          const dz = point.z - z
          const distanceSquared = dx * dx + dz * dz
          if (distanceSquared < nearestSquared) {
            nearestSquared = distanceSquared
            pathY = point.y
          }
        }
      }
    }

    const height = sampler(x, z)
    if (nearestSquared === Infinity) return height
    const distance = Math.sqrt(nearestSquared)
    if (distance >= radius) return height

    const t = smoothstep(distance / radius)
    return pathY * (1 - t) + height * t
  }
}
