import Alea from 'alea'
import {
  BackSide,
  BoxGeometry,
  type BufferGeometry,
  CircleGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { sample } from '~~/lib/arrays'
import type { Tile } from '~~/types/game.types'
import { BOARD_COLORS } from './colors'
import { OUTLINE_WIDTH_RATIO, outlineOf } from './ink-outline'
import type { TilePathResult } from './path'
import { type HeightSampler, smoothstep } from './terrain'

/**
 * The decorative pond: a rare board treat, not a challenge. One plain tile
 * becomes a plank bridge over a basin of still water — the tile keeps its
 * gameplay type ('normal'), only its look changes. Deterministic per seed.
 */
export interface PondSite {
  tileIndex: number
  center: Vector3
  tangent: Vector3
  waterY: number
  floorY: number
  waterRadius: number
  basinRadius: number
}

/** Roughly two boards in five carry a pond — a treat, not a fixture. */
const POND_CHANCE = 0.4
/** Water sits this far (×spacing) below the track... */
const WATER_DROP = 0.045
/** ...and the carved basin floor a bit further, so the water has depth. */
const FLOOR_DROP = 0.11
/** Water disc reach (×spacing) — wider than the basin's flat heart, so the
 *  shoreline is the organic terrain/water intersection, never a circle rim. */
const WATER_RADIUS = 1.05
/** Basin falloff reach (×spacing). */
const BASIN_RADIUS = 1.3
/** The two flanking tiles must sit within this rise (×spacing) of each other —
 *  a bridge over a slope reads broken. */
const LEVEL_TOLERANCE = 0.07

/**
 * Pick the pond tile, or undefined (most boards): a plain tile with plain
 * neighbours, level ground, and no other track row inside the basin.
 */
export const pickPondSite = (
  seed: string,
  tiles: Tile[],
  path: TilePathResult
): PondSite | undefined => {
  const random = Alea(`${seed}:water`)
  if (random() >= POND_CHANCE) return undefined

  const { transforms, shelfPoints, spacing } = path
  const density = (shelfPoints.length - 1) / (tiles.length - 1)
  const basinRadius = BASIN_RADIUS * spacing

  const candidates: number[] = []
  for (let index = 2; index < tiles.length - 2; index++) {
    const trio = [tiles[index - 1], tiles[index], tiles[index + 1]]
    if (trio.some(tile => tile.type !== 'normal')) continue

    const rise = Math.abs(transforms[index + 1].position.y - transforms[index - 1].position.y)
    if (rise > LEVEL_TOLERANCE * spacing) continue

    // The basin must not undermine another pass of the serpentine: every
    // shelf point outside this tile's own stretch stays clear of it.
    const center = transforms[index].position
    const denseIndex = Math.round(index * density)
    const ownStretch = 2 * density
    const clear = shelfPoints.every((point, dense) => {
      if (Math.abs(dense - denseIndex) <= ownStretch) return true
      const dx = point.x - center.x
      const dz = point.z - center.z
      return dx * dx + dz * dz > basinRadius * basinRadius
    })
    if (clear) candidates.push(index)
  }

  const tileIndex = sample(candidates, random)
  if (tileIndex === undefined) return undefined

  const { position, tangent } = transforms[tileIndex]
  return {
    tileIndex,
    center: position.clone(),
    tangent: tangent.clone(),
    waterY: position.y - WATER_DROP * spacing,
    floorY: position.y - FLOOR_DROP * spacing,
    waterRadius: WATER_RADIUS * spacing,
    basinRadius,
  }
}

/** Carve the pond basin into an existing sampler: a smoothstep dip to the
 *  floor around the site, untouched terrain beyond the falloff. */
export const withPondBasin = (sampler: HeightSampler, site: PondSite): HeightSampler => {
  const { center, floorY, basinRadius } = site
  return (x, z) => {
    const dx = x - center.x
    const dz = z - center.z
    const distanceSquared = dx * dx + dz * dz
    if (distanceSquared >= basinRadius * basinRadius) return sampler(x, z)

    const t = smoothstep(Math.sqrt(distanceSquared) / basinRadius)
    return floorY * (1 - t) + sampler(x, z) * t
  }
}

/**
 * The pond's meshes: still water, two milk ripple rings, and a low arched
 * plank bridge whose apex matches the tile-top height — pawns land on the
 * deck exactly as they would on the disc it replaces.
 */
export const buildPondMeshes = (site: PondSite, spacing: number, tileTopY: number): Mesh[] => {
  const meshes: Mesh[] = []
  const { center, tangent, waterY, waterRadius } = site

  const water = new CircleGeometry(waterRadius, 40)
  water.rotateX(-Math.PI / 2)
  water.translate(center.x, waterY, center.z)
  meshes.push(new Mesh(water, new MeshBasicMaterial({ color: BOARD_COLORS.pondBlue })))

  for (const reach of [0.38, 0.62]) {
    const ripple = new RingGeometry(waterRadius * reach, waterRadius * (reach + 0.035), 36)
    ripple.rotateX(-Math.PI / 2)
    ripple.translate(center.x, waterY + 0.05, center.z)
    meshes.push(
      new Mesh(
        ripple,
        // depthWrite off: translucent overlay a hair above the water plane
        new MeshBasicMaterial({
          color: BOARD_COLORS.sourMilk,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        })
      )
    )
  }

  // --- Bridge: planks arched along the path tangent -------------------------
  const matrix = new Matrix4()
  const quaternion = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    Math.atan2(tangent.x, tangent.z)
  )
  matrix.compose(center, quaternion, new Vector3(1, 1, 1))

  const planks: BufferGeometry[] = []
  const rails: BufferGeometry[] = []
  const outlines: BufferGeometry[] = []

  const halfSpan = 0.58 * spacing
  const plankCount = 7
  const plankLength = (halfSpan * 2) / plankCount
  const plankThickness = 0.06 * spacing
  const deckLocalY = tileTopY - center.y
  for (let index = 0; index < plankCount; index++) {
    const along = -halfSpan + plankLength * (index + 0.5)
    // Parabolic arc: apex at the tile centre (the pawn's resting height),
    // easing down toward both shores
    const dip = (along / halfSpan) ** 2 * 0.22 * spacing
    const plank = new BoxGeometry(0.6 * spacing, plankThickness, plankLength * 0.88)
    plank.translate(0, deckLocalY - plankThickness / 2 - dip, along)
    planks.push(plank)
  }

  for (const side of [-1, 1]) {
    const rail = new BoxGeometry(0.05 * spacing, 0.09 * spacing, halfSpan * 1.1)
    rail.translate(side * 0.29 * spacing, deckLocalY + 0.03 * spacing, 0)
    rails.push(rail)
  }

  for (const part of [...planks, ...rails]) {
    part.applyMatrix4(matrix)
    outlines.push(outlineOf(part, spacing * OUTLINE_WIDTH_RATIO))
  }

  meshes.push(
    new Mesh(
      mergeGeometries(outlines),
      new MeshBasicMaterial({ color: BOARD_COLORS.ink, side: BackSide })
    ),
    new Mesh(mergeGeometries(planks), new MeshToonMaterial({ color: BOARD_COLORS.warmSand })),
    new Mesh(mergeGeometries(rails), new MeshToonMaterial({ color: BOARD_COLORS.darkBlue }))
  )
  ;[...planks, ...rails, ...outlines].forEach(geometry => geometry.dispose())

  return meshes
}
