import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  BackSide,
  DoubleSide,
  PlaneGeometry,
  Quaternion,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IndividualChallengeAccessorId } from '~~/types/challenges/individual-challenge.type'
import type { Tile } from '~~/types/game.types'
import { createNumberAtlas } from './atlas'
import { BOARD_COLORS } from './colors'
import { type ContourMaterial, createContourMaterial } from './contour-material'
import { createTilePath, type TileTransform } from './path'
import { BOARD_SIZE, createHeightSampler, withPathShelf } from './terrain'

export interface BoardBuild {
  group: Group
  transforms: TileTransform[]
  spacing: number
  contourMaterial: ContourMaterial
  dispose(): void
}

/**
 * The board is rebuilt-on-mount several times per game (each movement phase).
 * The build is deterministic per (seed, tile count), so cache the latest one —
 * terrain displacement over ~90k vertices is the expensive part. three.js
 * re-uploads cached geometry/textures automatically when a new renderer mounts.
 */
let cachedBuild: { key: string; build: BoardBuild } | undefined

export const getBoardBuild = (seed: string, tiles: Tile[]): BoardBuild => {
  const key = `${seed}:${tiles.length}`
  if (cachedBuild?.key === key) return cachedBuild.build

  cachedBuild?.build.dispose()
  cachedBuild = { key, build: buildBoard(seed, tiles) }
  return cachedBuild.build
}

// The landscape extends far past the playable square so contour lines fill
// the whole view at any camera angle; the shader fades them out toward the
// horizon so the world melts into the cream background.
const TERRAIN_OVERHANG = 2.6

/**
 * Assemble the full static board: shelved contour terrain, the serpentine
 * track ribbon, instanced tile discs, tile numbers and challenge icons.
 * Deterministic per (seed, tiles) — every client builds the same board.
 */
export const buildBoard = (seed: string, tiles: Tile[]): BoardBuild => {
  const group = new Group()

  const rawSampler = createHeightSampler(seed)
  const { transforms, shelfPoints, spacing } = createTilePath(seed, tiles, rawSampler)
  const sampler = withPathShelf(rawSampler, shelfPoints, spacing * 1.05)

  // --- Terrain -------------------------------------------------------------
  const segments = typeof window !== 'undefined' && window.innerWidth < 900 ? 220 : 300
  const terrainSize = BOARD_SIZE * TERRAIN_OVERHANG
  const terrainGeometry = new PlaneGeometry(terrainSize, terrainSize, segments, segments)
  terrainGeometry.rotateX(-Math.PI / 2)

  const positions = terrainGeometry.attributes.position
  const slopes = new Float32Array(positions.count)
  const epsilon = terrainSize / segments
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index)
    const z = positions.getZ(index)
    positions.setY(index, sampler(x, z))

    // World-space slope magnitude — drives contour-line fading in the shader.
    // (Screen-space derivatives vary with zoom/view angle and made lines patchy.)
    const gradientX = (sampler(x + epsilon, z) - sampler(x - epsilon, z)) / (2 * epsilon)
    const gradientZ = (sampler(x, z + epsilon) - sampler(x, z - epsilon)) / (2 * epsilon)
    slopes[index] = Math.hypot(gradientX, gradientZ)
  }
  positions.needsUpdate = true
  terrainGeometry.setAttribute('aSlope', new BufferAttribute(slopes, 1))

  const contourMaterial = createContourMaterial(spacing * 4)
  group.add(new Mesh(terrainGeometry, contourMaterial))

  // --- Track ribbon ----------------------------------------------------------
  const ribbonCurve = new CatmullRomCurve3(
    shelfPoints.map(point => new Vector3(point.x, point.y + 0.18, point.z))
  )
  const ribbonGeometry = new TubeGeometry(ribbonCurve, tiles.length * 6, 0.16, 6, false)
  const ribbonMaterial = new MeshBasicMaterial({
    color: BOARD_COLORS.softBlue,
    transparent: true,
    opacity: 0.35,
  })
  group.add(new Mesh(ribbonGeometry, ribbonMaterial))

  // --- Tile discs (two instanced meshes: ink rim + colored top) -------------
  const tileRadius = spacing * 0.42
  const rimHeight = 0.55

  const unitDisc = new CylinderGeometry(1, 1, 1, 28)
  const rimMesh = new InstancedMesh(
    unitDisc,
    new MeshBasicMaterial({ color: BOARD_COLORS.ink }),
    tiles.length
  )
  const topMesh = new InstancedMesh(
    unitDisc,
    new MeshBasicMaterial({ color: '#ffffff' }),
    tiles.length
  )

  const matrix = new Matrix4()
  const quaternion = new Quaternion()
  const topColor = new Color()

  tiles.forEach((tile, index) => {
    const { position } = transforms[index]
    const emphasis = tile.type === 'final' || tile.type === 'start' ? 1.18 : 1

    matrix.compose(
      new Vector3(position.x, position.y + rimHeight / 2, position.z),
      quaternion,
      new Vector3(tileRadius * emphasis, rimHeight, tileRadius * emphasis)
    )
    rimMesh.setMatrixAt(index, matrix)

    matrix.compose(
      new Vector3(position.x, position.y + rimHeight / 2 + 0.09, position.z),
      quaternion,
      new Vector3(tileRadius * emphasis * 0.9, rimHeight, tileRadius * emphasis * 0.9)
    )
    topMesh.setMatrixAt(index, matrix)

    switch (tile.type) {
      case 'start':
        topColor.set(BOARD_COLORS.warmSand)
        break
      case 'final':
        topColor.set(BOARD_COLORS.hiorAnge)
        break
      case 'normal':
        topColor.set(BOARD_COLORS.sourMilk)
        break
      default:
        // Individual challenge tiles keep the current orb's mint semantics
        topColor.set(BOARD_COLORS.softMint)
    }
    topMesh.setColorAt(index, topColor)
  })
  rimMesh.instanceMatrix.needsUpdate = true
  topMesh.instanceMatrix.needsUpdate = true
  if (topMesh.instanceColor) topMesh.instanceColor.needsUpdate = true
  group.add(rimMesh, topMesh)

  // --- Tile numbers (merged quads over one atlas: a single draw call) -------
  const atlas = createNumberAtlas(tiles.length, BOARD_COLORS.darkBlue)
  const labelSize = tileRadius * 1.1
  const labelGeometries = tiles
    .filter(tile => tile.type === 'normal')
    .map(tile => {
      const { position } = transforms[tile.position]
      const quad = new PlaneGeometry(labelSize, labelSize)
      const { u, v, width, height } = atlas.uvFor(tile.position)
      const uv = quad.attributes.uv
      for (let corner = 0; corner < uv.count; corner++) {
        uv.setXY(corner, u + uv.getX(corner) * width, v + uv.getY(corner) * height)
      }
      quad.rotateX(-Math.PI / 2)
      quad.translate(position.x, position.y + rimHeight + 0.16, position.z)
      return quad
    })

  if (labelGeometries.length) {
    const labelMesh = new Mesh(
      mergeGeometries(labelGeometries),
      new MeshBasicMaterial({ map: atlas.texture, transparent: true })
    )
    labelGeometries.forEach(geometry => geometry.dispose())
    group.add(labelMesh)
  }

  // --- Challenge markers: 3D gates at each challenge tile's exit edge -------
  buildChallengeMarkers(tiles, transforms, spacing, tileRadius).forEach(mesh => group.add(mesh))

  const dispose = () => {
    group.traverse(child => {
      if (child instanceof Mesh || child instanceof InstancedMesh) {
        child.geometry.dispose()
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach(material => {
          if ('map' in material && material.map) material.map.dispose()
          material.dispose()
        })
      }
    })
  }

  return { group, transforms, spacing, contourMaterial, dispose }
}

interface MarkerPart {
  geometry: BufferGeometry
  color: string
}

/**
 * Local-space marker shapes per challenge type (y up, origin at tile ground,
 * +z pointing along the path). Chunky low-poly forms in the toon language:
 * a flag for flag challenges, an obelisk for capitals, a signpost for ISO
 * codes and a full arch spanning the final tile — physical gates that read
 * as a hard border to pass.
 */
const markerPartsFor = (
  type: IndividualChallengeAccessorId | 'final',
  spacing: number
): MarkerPart[] => {
  const s = spacing
  switch (type) {
    case 'flag': {
      const pole = new CylinderGeometry(0.045 * s, 0.045 * s, 0.95 * s, 10)
      pole.translate(0, 0.475 * s, 0)
      const pennant = new BoxGeometry(0.42 * s, 0.24 * s, 0.05 * s)
      pennant.translate(0.24 * s, 0.78 * s, 0)
      return [
        { geometry: pole, color: BOARD_COLORS.darkBlue },
        { geometry: pennant, color: BOARD_COLORS.hiorAnge },
      ]
    }
    case 'capital.name': {
      const shaft = new CylinderGeometry(0.09 * s, 0.16 * s, 0.8 * s, 4)
      shaft.translate(0, 0.4 * s, 0)
      const cap = new ConeGeometry(0.13 * s, 0.2 * s, 4)
      cap.translate(0, 0.9 * s, 0)
      return [
        { geometry: shaft, color: BOARD_COLORS.warmSand },
        { geometry: cap, color: BOARD_COLORS.darkBlue },
      ]
    }
    case 'isoCode': {
      const pole = new CylinderGeometry(0.045 * s, 0.045 * s, 0.85 * s, 10)
      pole.translate(0, 0.425 * s, 0)
      const plate = new BoxGeometry(0.55 * s, 0.32 * s, 0.05 * s)
      plate.translate(0, 0.72 * s, 0)
      return [
        { geometry: pole, color: BOARD_COLORS.darkBlue },
        { geometry: plate, color: BOARD_COLORS.warmSand },
      ]
    }
    case 'final': {
      const parts: MarkerPart[] = []
      for (const side of [-1, 1]) {
        const pillar = new BoxGeometry(0.16 * s, 1.15 * s, 0.16 * s)
        pillar.translate(side * 0.5 * s, 0.575 * s, 0)
        parts.push({ geometry: pillar, color: BOARD_COLORS.darkBlue })
      }
      const lintel = new BoxGeometry(1.25 * s, 0.16 * s, 0.2 * s)
      lintel.translate(0, 1.2 * s, 0)
      parts.push({ geometry: lintel, color: BOARD_COLORS.hiorAnge })
      return parts
    }
  }
}

/** Inverted-hull copy of a part, inflated about its own local center. */
const outlineOf = (geometry: BufferGeometry): BufferGeometry => {
  const outline = geometry.clone()
  outline.computeBoundingBox()
  const center = new Vector3()
  outline.boundingBox?.getCenter(center)
  outline.translate(-center.x, -center.y, -center.z)
  outline.scale(1.07, 1.07, 1.07)
  outline.translate(center.x, center.y, center.z)
  return outline
}

/**
 * All challenge markers merged by color (a handful of draw calls total):
 * toon-shaded structures plus one ink inverted-hull outline mesh.
 */
const buildChallengeMarkers = (
  tiles: Tile[],
  transforms: TileTransform[],
  spacing: number,
  tileRadius: number
): Mesh[] => {
  const colorBuckets = new Map<string, BufferGeometry[]>()
  const outlines: BufferGeometry[] = []
  const matrix = new Matrix4()
  const quaternion = new Quaternion()
  const up = new Vector3(0, 1, 0)

  for (const tile of tiles) {
    if (tile.type === 'normal' || tile.type === 'start') continue

    const { position, tangent } = transforms[tile.position]
    const isFinal = tile.type === 'final'
    const parts = markerPartsFor(isFinal ? 'final' : tile.type, spacing)

    // Gates stand at the tile's exit edge, facing across the path — the
    // final arch spans the tile itself
    const anchor = isFinal
      ? position.clone()
      : position.clone().addScaledVector(tangent, tileRadius * 1.05)
    quaternion.setFromAxisAngle(up, Math.atan2(tangent.x, tangent.z))
    matrix.compose(anchor, quaternion, new Vector3(1, 1, 1))

    for (const part of parts) {
      const outline = outlineOf(part.geometry)
      outline.applyMatrix4(matrix)
      outlines.push(outline)

      part.geometry.applyMatrix4(matrix)
      const bucket = colorBuckets.get(part.color) ?? []
      bucket.push(part.geometry)
      colorBuckets.set(part.color, bucket)
    }
  }

  const meshes: Mesh[] = []
  if (outlines.length) {
    meshes.push(
      new Mesh(
        mergeGeometries(outlines),
        new MeshBasicMaterial({ color: BOARD_COLORS.ink, side: BackSide })
      )
    )
    outlines.forEach(geometry => geometry.dispose())
  }
  for (const [color, bucket] of colorBuckets) {
    meshes.push(new Mesh(mergeGeometries(bucket), new MeshToonMaterial({ color })))
    bucket.forEach(geometry => geometry.dispose())
  }

  return meshes
}

/**
 * The PlayerPawn silhouette revolved into 3D: toon-shaded body (the only lit
 * objects in the scene), an inverted-hull ink outline, and a soft contact
 * shadow disc to ground it.
 */
export const buildPawn = (color: string, height: number): Group => {
  const profile = [
    new Vector2(0.3, 0),
    new Vector2(0.3, 0.09),
    new Vector2(0.2, 0.15),
    new Vector2(0.115, 0.3),
    new Vector2(0.085, 0.52),
    new Vector2(0.16, 0.58),
    new Vector2(0.085, 0.63),
    new Vector2(0.15, 0.72),
    new Vector2(0.165, 0.8),
    new Vector2(0.11, 0.92),
    new Vector2(0, 0.96),
  ].map(point => point.multiplyScalar(height))

  const geometry = new LatheGeometry(profile, 32)
  const body = new Mesh(geometry, new MeshToonMaterial({ color }))
  const outline = new Mesh(
    geometry,
    new MeshBasicMaterial({ color: BOARD_COLORS.ink, side: BackSide })
  )
  outline.scale.set(1.09, 1.045, 1.09)

  const shadowGeometry = new CircleGeometry(height * 0.34, 24)
  shadowGeometry.rotateX(-Math.PI / 2)
  const shadow = new Mesh(
    shadowGeometry,
    new MeshBasicMaterial({ color: BOARD_COLORS.ink, transparent: true, opacity: 0.16 })
  )
  shadow.position.y = 0.04

  const pawn = new Group()
  pawn.add(shadow, outline, body)
  return pawn
}

export type CrownVariant = 'champion' | 'finisher'

/**
 * A victory crown resting on the pawn's head: full-size gold for the
 * champion, smaller silver for later finishers. Same recipe as the pawn:
 * toon-shaded body plus an ink inverted-hull outline. `height` is the pawn
 * height passed to buildPawn; the smaller variant perches nearer the apex
 * where the head is narrower.
 */
export const buildCrown = (height: number, variant: CrownVariant): Group => {
  const champion = variant === 'champion'
  const scale = champion ? 1 : 0.7
  // The band shrinks less than the spikes: any narrower and the head
  // (plus its 1.09x outline hull) swallows the finisher's circlet
  const bandRadius = height * 0.15 * (champion ? 1 : 0.85)
  const bandHeight = height * 0.09 * scale

  const band = new CylinderGeometry(bandRadius * 1.1, bandRadius, bandHeight, 20, 1, true)
  const parts: BufferGeometry[] = [band]

  const spikeCount = champion ? 5 : 4
  const spikeHeight = height * 0.11 * scale
  for (let i = 0; i < spikeCount; i++) {
    const angle = (i / spikeCount) * Math.PI * 2
    const spike = new ConeGeometry(bandRadius * 0.32, spikeHeight, 8)
    spike.translate(
      Math.cos(angle) * bandRadius * 0.95,
      bandHeight / 2 + spikeHeight * 0.4,
      Math.sin(angle) * bandRadius * 0.95
    )
    parts.push(spike)
  }

  const outlines = parts.map(outlineOf)
  const outline = new Mesh(
    mergeGeometries(outlines),
    new MeshBasicMaterial({ color: BOARD_COLORS.ink, side: BackSide })
  )
  const body = new Mesh(
    mergeGeometries(parts),
    new MeshToonMaterial({
      color: champion ? BOARD_COLORS.warmSand : BOARD_COLORS.silver,
      // The band is an open tube; its inside shows through the tilt gap
      side: DoubleSide,
    })
  )
  outlines.forEach(geometry => geometry.dispose())
  parts.forEach(geometry => geometry.dispose())

  const crown = new Group()
  crown.name = 'crown'
  crown.userData.variant = variant
  crown.add(outline, body)
  crown.position.y = height * (champion ? 0.86 : 0.9)
  crown.rotation.z = 0.09
  return crown
}

export const disposePawn = (pawn: Group) => {
  pawn.traverse(child => {
    if (child instanceof Mesh) {
      child.geometry.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach(material => material.dispose())
    }
  })
}
