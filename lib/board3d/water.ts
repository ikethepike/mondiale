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
  site: PondSite,
  sampler: HeightSampler,
  biome: BoardBiome
): Mesh => {
  const random = Alea(`${seed}:pond-ice`)
  const { center, waterY, waterRadius } = site
  const segments: BufferGeometry[] = []
  const crackCount = 2 + Math.floor(random() * 2)
  for (let crack = 0; crack < crackCount; crack++) {
    let x = center.x + (random() - 0.5) * waterRadius * 0.6
    let z = center.z + (random() - 0.5) * waterRadius * 0.6
    let heading = random() * Math.PI * 2
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
  if (!segments.length) {
    // Every wander hit the shallows at once — one short crack over the deep
    // heart keeps the sheet readable (and mergeGeometries fed).
    const piece = new BoxGeometry(0.035, 0.012, waterRadius * 0.6)
    piece.rotateY(random() * Math.PI)
    piece.translate(center.x, waterY + 0.012, center.z)
    segments.push(piece)
  }
  const merged = mergeGeometries(segments)
  segments.forEach(segment => segment.dispose())
  return new Mesh(merged, new MeshBasicMaterial({ color: biome.minor }))
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
  // organic terrain/water intersection either way.
  const water = new PlaneGeometry(waterRadius * 2.6, waterRadius * 2.6, 28, 28)
  water.rotateX(-Math.PI / 2)
  water.translate(center.x, waterY, center.z)
  const positions = water.attributes.position
  const pondDepths = new Float32Array(positions.count)
  for (let index = 0; index < positions.count; index++) {
    pondDepths[index] = waterY - sampler(positions.getX(index), positions.getZ(index))
  }
  water.setAttribute('aDepth', new BufferAttribute(pondDepths, 1))
  if (biome.name === 'ice') {
    meshes.push(new Mesh(water, createIceSheetMaterial(biome)))
    meshes.push(buildIceCracks(seed, site, sampler, biome))
  } else {
    meshes.push(new Mesh(water, createWaterMaterial(biome, timeUniforms)))
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
