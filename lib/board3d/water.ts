import Alea from 'alea'
import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Color,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { sample } from '~~/lib/arrays'
import type { Tile } from '~~/types/game.types'
import { BOARD_COLORS } from './colors'
import { OUTLINE_WIDTH_RATIO, outlineOf } from './ink-outline'
import type { TilePathResult } from './path'
import { type HeightSampler, smoothstep } from './terrain'
import type { BoardBiome } from './biomes'
import type { LakeSite } from './lake'

/**
 * The living-water material, proven in /test-terrain: per-vertex ANALYTIC
 * depth (we carved the beds, so we know it — no depth textures, no mobile
 * banding) drives a foam shore, depth-scaled transparency and a two-tone
 * shallow→deep fall; `uTime` shimmers the foam edge. Rivers, falls and
 * plunge pools all render through it.
 */
export const createWaterMaterial = (
  biome: BoardBiome,
  timeUniforms: { value: number }[]
): ShaderMaterial => {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      uWater: { value: new Color(biome.water) },
      uFoam: { value: new Color(biome.foam) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aDepth;
      varying float vDepth;
      varying vec2 vXZ;
      void main() {
        vDepth = aDepth;
        vXZ = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uWater; uniform vec3 uFoam; uniform float uTime;
      varying float vDepth; varying vec2 vXZ;
      void main() {
        if (vDepth <= 0.0) discard;
        float shimmer = sin(uTime * 1.1 + vXZ.x * 1.7 + vXZ.y * 1.3) * 0.045;
        float foam = 1.0 - smoothstep(0.04, 0.2 + shimmer, vDepth);
        float alpha = mix(0.3, 0.72, smoothstep(0.0, 1.1, vDepth));
        vec3 color = mix(uWater, uWater * 0.55, smoothstep(0.3, 1.3, vDepth));
        color = mix(color, uFoam, foam);
        gl_FragColor = vec4(color, max(alpha, foam * 0.9));
        #include <colorspace_fragment>
      }
    `,
  })
  timeUniforms.push(material.uniforms.uTime as { value: number })
  return material
}

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

/** The frozen sheet: opaque snow-white, a thin ink rim where depth crosses
 *  zero — the pond drawn as a map symbol rather than lit as water. Static by
 *  nature, so it registers no clock. */
const createIceSheetMaterial = (biome: BoardBiome): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uSheet: { value: new Color(biome.snow) },
      uRim: { value: new Color(biome.minor) },
    },
    vertexShader: /* glsl */ `
      attribute float aDepth;
      varying float vDepth;
      void main() {
        vDepth = aDepth;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSheet; uniform vec3 uRim;
      varying float vDepth;
      void main() {
        if (vDepth <= 0.0) discard;
        float rim = 1.0 - smoothstep(0.03, 0.16, vDepth);
        gl_FragColor = vec4(mix(uSheet, uRim, rim * 0.85), 1.0);
        #include <colorspace_fragment>
      }
    `,
  })

/** Hairline cracks wandering out from the sheet's heart: 2–3 kinked ink
 *  polylines, each segment ending before the shoreline shallows. */
const buildIceCracks = (
  seed: string,
  center: Vector3,
  waterY: number,
  waterRadius: number,
  sampler: HeightSampler,
  biome: BoardBiome
): Mesh => {
  const random = Alea(`${seed}:pond-ice`)
  const segments: BufferGeometry[] = []
  const crackCount = 2 + Math.floor(random() * 2)
  for (let crack = 0; crack < crackCount; crack++) {
    let x = center.x + (random() - 0.5) * waterRadius * 0.6
    let z = center.z + (random() - 0.5) * waterRadius * 0.6
    let heading = random() * Math.PI * 2
    // A concave footprint (a C-shaped lake) can put the centroid — and a
    // wander's start — over dry ground: a crack begins only on real ice.
    if (waterY - sampler(x, z) < 0.05) continue
    for (let step = 0; step < 3; step++) {
      const length = waterRadius * (0.25 + random() * 0.2)
      const nextX = x + Math.sin(heading) * length
      const nextZ = z + Math.cos(heading) * length
      // Stop at the shallows: a crack tip on dry land breaks the fiction.
      if (waterY - sampler(nextX, nextZ) < 0.05) break
      const piece = new BoxGeometry(0.035, 0.012, length)
      piece.rotateY(heading)
      piece.translate((x + nextX) / 2, waterY + 0.012, (z + nextZ) / 2)
      segments.push(piece)
      x = nextX
      z = nextZ
      heading += (random() - 0.5) * 1.1
    }
  }
  if (!segments.length && waterY - sampler(center.x, center.z) >= 0.05) {
    // Every wander hit the shallows at once — one short crack over the deep
    // heart keeps the sheet readable, when the heart is actually wet.
    const piece = new BoxGeometry(0.035, 0.012, waterRadius * 0.6)
    piece.rotateY(random() * Math.PI)
    piece.translate(center.x, waterY + 0.012, center.z)
    segments.push(piece)
  }
  if (!segments.length) return new Mesh()
  const merged = mergeGeometries(segments)
  segments.forEach(segment => segment.dispose())
  return new Mesh(merged, new MeshBasicMaterial({ color: biome.minor }))
}

/**
 * The lake's water: one clipped grid over the discovered footprint. Depth is
 * analytic like the pond's, but a cell OUTSIDE the flood mask is forced dry
 * even when it dips under the water line — a second unconnected hollow
 * inside the bounding box must not fill. Frozen solid on ice boards.
 */
export const buildLakeMeshes = (
  seed: string,
  lake: LakeSite,
  biome: BoardBiome,
  sampler: HeightSampler,
  timeUniforms: { value: number }[]
): Mesh[] => {
  const { center, waterY, boundingRadius, grid } = lake
  const size = boundingRadius * 2 + 2
  const segments = Math.min(96, Math.max(24, Math.ceil(size / 1.1)))
  const water = new PlaneGeometry(size, size, segments, segments)
  water.rotateX(-Math.PI / 2)
  water.translate(center.x, waterY, center.z)

  // The flood mask read as a BILINEAR field, not a cell test: a hard
  // per-cell gate cut the water along axis-aligned grid steps wherever the
  // mask (not the depth) was the clipping edge, and lakes came out
  // semi-rectilinear. Subtracting by the smooth field instead puts the
  // shoreline on a diagonal-capable iso-line between cells.
  const maskAt = (x: number, z: number): number => {
    const gridX = (x - grid.originX) / grid.step
    const gridZ = (z - grid.originZ) / grid.step
    const column = Math.floor(gridX)
    const row = Math.floor(gridZ)
    if (column < 0 || row < 0 || column >= grid.columns - 1 || row >= grid.rows - 1) return 0
    const fx = gridX - column
    const fz = gridZ - row
    const a = grid.mask[row * grid.columns + column]
    const b = grid.mask[row * grid.columns + column + 1]
    const c = grid.mask[(row + 1) * grid.columns + column]
    const d = grid.mask[(row + 1) * grid.columns + column + 1]
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz
  }

  const positions = water.attributes.position
  const depths = new Float32Array(positions.count)
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index)
    const z = positions.getZ(index)
    // Full mask: pure analytic depth. Off the mask, the deficit drowns the
    // depth smoothly — an unconnected hollow inside the bounding box still
    // never fills, but the cut follows the field, not the lattice.
    depths[index] = waterY - sampler(x, z) - (1 - maskAt(x, z)) * 3
  }
  water.setAttribute('aDepth', new BufferAttribute(depths, 1))

  if (biome.waterState === 'frozen') {
    return [
      new Mesh(water, createIceSheetMaterial(biome)),
      buildIceCracks(seed, center, waterY, boundingRadius * 0.6, sampler, biome),
    ]
  }
  return [new Mesh(water, createWaterMaterial(biome, timeUniforms))]
}

/**
 * The pond's meshes: still water, two milk ripple rings, and a low arched
 * plank bridge whose apex matches the tile-top height — pawns land on the
 * deck exactly as they would on the disc it replaces. On an ice board the
 * water is FROZEN: an opaque ink-rimmed sheet with hairline cracks — a
 * skating rink instead of a shimmer, naturally still under reduced motion.
 */
export const buildPondMeshes = (
  seed: string,
  site: PondSite,
  spacing: number,
  tileTopY: number,
  biome: BoardBiome,
  sampler: HeightSampler,
  timeUniforms: { value: number }[]
): Mesh[] => {
  const meshes: Mesh[] = []
  const { center, tangent, waterY, waterRadius } = site

  // Living water: a grid with per-vertex analytic depth (water line minus
  // the carved basin under each vertex) — the foam shoreline emerges where
  // depth crosses zero, replacing the old flat disc and milk ripple rings.
  // The frozen sheet keeps the same clipped grid, so the shoreline stays the
  // organic terrain/water intersection either way. The depth field FADES
  // with distance from the basin: only the carve guarantees dry ground, and
  // where the outside country falls below the pond's level the plane's
  // square corners used to render as a floating sheet.
  const water = new PlaneGeometry(waterRadius * 2.6, waterRadius * 2.6, 28, 28)
  water.rotateX(-Math.PI / 2)
  water.translate(center.x, waterY, center.z)
  const positions = water.attributes.position
  const pondDepths = new Float32Array(positions.count)
  const holdFrom = waterRadius * 1.1
  const holdTo = site.basinRadius
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index)
    const z = positions.getZ(index)
    const reach = Math.hypot(x - center.x, z - center.z)
    const hold = 1 - smoothstep(Math.min(1, Math.max(0, (reach - holdFrom) / (holdTo - holdFrom))))
    pondDepths[index] = (Math.max(waterY - sampler(x, z), 0) + 0.02) * hold - 0.02
  }
  water.setAttribute('aDepth', new BufferAttribute(pondDepths, 1))
  if (biome.waterState === 'frozen') {
    meshes.push(new Mesh(water, createIceSheetMaterial(biome)))
    meshes.push(buildIceCracks(seed, center, waterY, waterRadius, sampler, biome))
  } else {
    meshes.push(new Mesh(water, createWaterMaterial(biome, timeUniforms)))
  }

  // --- Bridge: planks arched along the path tangent -------------------------
  buildPlankBridge(center, tangent, spacing, tileTopY).forEach(mesh => meshes.push(mesh))

  return meshes
}

/**
 * The low arched plank bridge, extracted so the pond AND a river's track
 * crossing build the same deck: planks arched along `tangent`, apex at
 * `deckTopY` (the pawn's resting height), rails in ink. Track furniture —
 * biome-blind cream-and-ink.
 */
export const buildPlankBridge = (
  center: Vector3,
  tangent: Vector3,
  spacing: number,
  deckTopY: number
): Mesh[] => {
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
  const deckLocalY = deckTopY - center.y
  for (let index = 0; index < plankCount; index++) {
    const along = -halfSpan + plankLength * (index + 0.5)
    // Parabolic arc: apex at the deck height, easing down toward both shores
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

  const meshes = [
    new Mesh(
      mergeGeometries(outlines),
      new MeshBasicMaterial({ color: BOARD_COLORS.ink, side: BackSide })
    ),
    new Mesh(mergeGeometries(planks), new MeshToonMaterial({ color: BOARD_COLORS.warmSand })),
    new Mesh(mergeGeometries(rails), new MeshToonMaterial({ color: BOARD_COLORS.darkBlue })),
  ]
  ;[...planks, ...rails, ...outlines].forEach(geometry => geometry.dispose())
  return meshes
}
