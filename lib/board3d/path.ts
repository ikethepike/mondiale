import Alea from 'alea'
import { CatmullRomCurve3, Vector3 } from 'three'
import type { Tile } from '~~/types/game.types'
import { BOARD_SIZE, type HeightSampler } from './terrain'

export interface TileTransform {
  position: Vector3
  tangent: Vector3
}

export interface TilePathResult {
  /** One transform per game tile, index-aligned with `game.tiles`. */
  transforms: TileTransform[]
  /** Dense, elevation-smoothed samples along the track for terrain shelving. */
  shelfPoints: Vector3[]
  /** Arc-length distance between adjacent tile centers. */
  spacing: number
}

const DENSITY = 4 // shelf samples per tile segment

/**
 * Lay the game tiles along a flowing, deterministically-jittered serpentine:
 * serpentine control points → centripetal Catmull-Rom spline → N equidistant
 * arc-length samples. Same seed → identical path on every client.
 */
export const createTilePath = (
  seed: string,
  tiles: Tile[],
  sampler: HeightSampler
): TilePathResult => {
  const prng = Alea(`${seed}:path`)
  const count = tiles.length

  const tilesPerRow = Math.ceil(Math.sqrt(count * 1.7))
  const rows = Math.max(2, Math.ceil(count / tilesPerRow))

  const innerWidth = BOARD_SIZE * 0.78
  const innerDepth = BOARD_SIZE * 0.78
  const rowPitch = innerDepth / (rows - 1)

  // Serpentine control points: 4 per row, alternating direction, jittered.
  const controlPoints: Vector3[] = []
  for (let row = 0; row < rows; row++) {
    const z = -innerDepth / 2 + row * rowPitch
    const fractions = [-0.5, -1 / 6, 1 / 6, 0.5]
    const xs = fractions.map(fraction => fraction * innerWidth)
    if (row % 2 === 1) xs.reverse()

    xs.forEach((x, index) => {
      const isEndpoint = index === 0 || index === xs.length - 1
      const jitterX = (prng() - 0.5) * innerWidth * (isEndpoint ? 0.04 : 0.1)
      const jitterZ = (prng() - 0.5) * rowPitch * 0.3
      controlPoints.push(new Vector3(x + jitterX, 0, z + jitterZ))
    })
  }

  const curve = new CatmullRomCurve3(controlPoints, false, 'centripetal')

  // Dense equidistant samples; every DENSITY-th one is a tile center.
  const denseCount = DENSITY * (count - 1) + 1
  const densePoints = curve.getSpacedPoints(denseCount - 1)

  // Elevate along the raw terrain, then smooth so the track never staircases.
  const rawElevations = densePoints.map(point => sampler(point.x, point.z))
  const window = 9
  const smoothed = rawElevations.map((_, index) => {
    let sum = 0
    let samples = 0
    for (let offset = -window; offset <= window; offset++) {
      const at = index + offset
      if (at < 0 || at >= denseCount) continue
      sum += rawElevations[at]
      samples++
    }
    return sum / samples
  })

  const shelfPoints = densePoints.map(
    (point, index) => new Vector3(point.x, smoothed[index], point.z)
  )

  const transforms: TileTransform[] = tiles.map((_, index) => {
    const dense = index * DENSITY
    const previous = shelfPoints[Math.max(0, dense - 1)]
    const next = shelfPoints[Math.min(denseCount - 1, dense + 1)]
    const tangent = new Vector3().subVectors(next, previous).setY(0).normalize()

    return {
      position: shelfPoints[dense].clone(),
      tangent,
    }
  })

  const spacing = curve.getLength() / (count - 1)

  return { transforms, shelfPoints, spacing }
}
