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
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IndividualChallengeAccessorId } from '~~/types/challenges/individual-challenge.type'
import type { Tile } from '~~/types/game.types'
import { PHONE_MAX_PX } from '~~/lib/use-viewport'
import { CLIMAX_TILES } from '~~/lib/tiles'
import { createNumberAtlas } from './atlas'
import { BOARD_COLORS, TILE_TOP_TINTS } from './colors'
import { type ContourMaterial, createContourMaterial } from './contour-material'
import { outlineOf } from './ink-outline'
import { createTilePath, type TileTransform } from './path'
import { BOARD_SIZE, createHeightSampler, withEdgeFalloff, withPathShelf } from './terrain'
import { buildPondMeshes, pickPondSite, withPondBasin } from './water'

export interface BoardBuild {
  group: Group
  transforms: TileTransform[]
  spacing: number
  contourMaterial: ContourMaterial
  dispose(): void
}

/**
 * The board is rebuilt-on-mount several times per game (each movement phase).
 * The build is deterministic per (seed, tiles), so cache the latest one —
 * terrain displacement over ~90k vertices is the expensive part. three.js
 * re-uploads cached geometry/textures automatically when a new renderer mounts.
 */
let cachedBuild: { key: string; build: BoardBuild } | undefined

/** Tile types vary independently of length (seeded gate rhythm), so the cache
 *  key fingerprints every type — a same-length regeneration still rebuilds. */
export const boardBuildKey = (seed: string, tiles: Tile[]): string =>
  `${seed}:${tiles.map(tile => tile.type).join(',')}`

export const getBoardBuild = (seed: string, tiles: Tile[]): BoardBuild => {
  const key = boardBuildKey(seed, tiles)
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
const buildBoard = (seed: string, tiles: Tile[]): BoardBuild => {
  const group = new Group()

  // Edge falloff wraps the base field so hills subside into the page at the
  // horizon; the track (radius < EDGE_FADE_START) never feels it.
  const rawSampler = withEdgeFalloff(createHeightSampler(seed))
  const tilePath = createTilePath(seed, tiles, rawSampler)
  const { transforms, shelfPoints, spacing } = tilePath

  // A rare decorative pond: one plain tile trades its disc for a plank
  // bridge over basin-carved water. Purely visual — the tile stays 'normal'.
  const pondSite = pickPondSite(seed, tiles, tilePath)

  const shelved = withPathShelf(rawSampler, shelfPoints, spacing * 1.05)
  const sampler = pondSite ? withPondBasin(shelved, pondSite) : shelved

  // --- Terrain -------------------------------------------------------------
  const segments = typeof window !== 'undefined' && window.innerWidth <= PHONE_MAX_PX ? 220 : 300
  const terrainSize = BOARD_SIZE * TERRAIN_OVERHANG
  const terrainGeometry = new PlaneGeometry(terrainSize, terrainSize, segments, segments)
  terrainGeometry.rotateX(-Math.PI / 2)

  const positions = terrainGeometry.attributes.position
  const slopes = new Float32Array(positions.count)
  const epsilon = terrainSize / segments

  // One sampler tap per vertex: the grid pitch equals `epsilon`, so the
  // finite-difference taps land exactly on neighbouring lattice points —
  // central differences over the precomputed heights are identical to
  // re-sampling, at a fifth of the cost. PlaneGeometry is row-major with x
  // varying fastest; one-sided differences at the (faded-out) edges.
  const lattice = segments + 1
  const heights = new Float32Array(positions.count)
  for (let index = 0; index < positions.count; index++) {
    heights[index] = sampler(positions.getX(index), positions.getZ(index))
  }
  for (let index = 0; index < positions.count; index++) {
    positions.setY(index, heights[index])

    // World-space slope magnitude — drives contour-line fading in the shader.
    // (Screen-space derivatives vary with zoom/view angle and made lines patchy.)
    const row = Math.floor(index / lattice)
    const column = index % lattice
    const left = Math.max(column - 1, 0)
    const right = Math.min(column + 1, segments)
    const near = Math.max(row - 1, 0)
    const far = Math.min(row + 1, segments)
    const gradientX =
      (heights[row * lattice + right] - heights[row * lattice + left]) / ((right - left) * epsilon)
    const gradientZ =
      (heights[far * lattice + column] - heights[near * lattice + column]) /
      ((far - near) * epsilon)
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
  const climaxWarmth = new Color(BOARD_COLORS.warmSand)

  tiles.forEach((tile, index) => {
    const { position } = transforms[index]
    const emphasis = tile.type === 'final' || tile.type === 'start' ? 1.18 : 1

    // The pond tile's discs collapse to nothing — the bridge deck stands in
    if (index === pondSite?.tileIndex) {
      matrix.compose(position, quaternion, new Vector3(0, 0, 0))
      rimMesh.setMatrixAt(index, matrix)
      topMesh.setMatrixAt(index, matrix)
      return
    }

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
      case 'normal': {
        topColor.set(BOARD_COLORS.sourMilk)
        // Final approach warms up: plain tiles inside the climax zone blend
        // toward sand the closer they sit to the arch.
        const climaxProgress = (index - (tiles.length - 1 - CLIMAX_TILES)) / CLIMAX_TILES
        if (climaxProgress > 0) topColor.lerp(climaxWarmth, climaxProgress * 0.45)
        break
      }
      default:
        // Gate tops carry their theme's wash; the marker stays the lead cue
        topColor.set(TILE_TOP_TINTS[tile.type])
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
    .filter(tile => tile.type === 'normal' && tile.position !== pondSite?.tileIndex)
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

  // --- Pond + bridge (when this board drew one) ------------------------------
  if (pondSite) {
    const tileTopY = pondSite.center.y + rimHeight + 0.09
    buildPondMeshes(pondSite, spacing, tileTopY).forEach(mesh => group.add(mesh))
  }

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
 * codes, a statue for leaders, a standing coin for currencies, a pyramid for
 * landmarks and a full arch spanning the final tile — physical gates that
 * read as a hard border to pass.
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
    case 'government.leader': {
      const plinth = new BoxGeometry(0.34 * s, 0.22 * s, 0.34 * s)
      plinth.translate(0, 0.11 * s, 0)
      const torso = new CylinderGeometry(0.07 * s, 0.13 * s, 0.42 * s, 10)
      torso.translate(0, 0.43 * s, 0)
      const head = new SphereGeometry(0.1 * s, 12, 10)
      head.translate(0, 0.72 * s, 0)
      return [
        { geometry: plinth, color: BOARD_COLORS.warmSand },
        { geometry: torso, color: BOARD_COLORS.darkBlue },
        { geometry: head, color: BOARD_COLORS.darkBlue },
      ]
    }
    case 'currency': {
      const plinth = new BoxGeometry(0.4 * s, 0.14 * s, 0.2 * s)
      plinth.translate(0, 0.07 * s, 0)
      // A fat disc stood on its edge — reads as a coin at board scale
      const coin = new CylinderGeometry(0.26 * s, 0.26 * s, 0.09 * s, 20)
      coin.rotateX(Math.PI / 2)
      coin.translate(0, 0.42 * s, 0)
      return [
        { geometry: plinth, color: BOARD_COLORS.darkBlue },
        { geometry: coin, color: BOARD_COLORS.warmSand },
      ]
    }
    case 'landmarks': {
      const base = new BoxGeometry(0.52 * s, 0.1 * s, 0.52 * s)
      base.translate(0, 0.05 * s, 0)
      const pyramid = new ConeGeometry(0.34 * s, 0.55 * s, 4)
      pyramid.rotateY(Math.PI / 4)
      pyramid.translate(0, 0.375 * s, 0)
      return [
        { geometry: base, color: BOARD_COLORS.darkBlue },
        { geometry: pyramid, color: BOARD_COLORS.warmSand },
      ]
    }
    case 'errata': {
      // Crossed signposts: one post carrying two name plates tilted opposite
      // ways — the swap made physical. Shares the ISO gate's post on purpose
      // (both are "a sign that names a place"); the tilt and the alert red,
      // which no other marker uses, are what tell them apart at board scale.
      const pole = new CylinderGeometry(0.045 * s, 0.045 * s, 0.95 * s, 10)
      pole.translate(0, 0.475 * s, 0)
      const lower = new BoxGeometry(0.5 * s, 0.2 * s, 0.05 * s)
      lower.rotateZ(-0.21)
      lower.translate(0, 0.5 * s, 0)
      const upper = new BoxGeometry(0.5 * s, 0.2 * s, 0.05 * s)
      upper.rotateZ(0.21)
      upper.translate(0, 0.8 * s, 0)
      return [
        { geometry: pole, color: BOARD_COLORS.darkBlue },
        { geometry: lower, color: BOARD_COLORS.warmSand },
        { geometry: upper, color: BOARD_COLORS.hiorAnge },
      ]
    }
    case 'lexicon': {
      // An open book on a lectern — the register of names. Every other marker
      // is a tall thin thing on a post; this one is low and WIDE, and from the
      // overhead camera the two broad pages read as a spread where the errata
      // gate's plates read as two thin lines. A banded stele was tried first
      // and stood there saying nothing: a shape has to name its category, not
      // just differ from its neighbours.
      const post = new BoxGeometry(0.14 * s, 0.34 * s, 0.14 * s)
      post.translate(0, 0.17 * s, 0)
      const desk = new BoxGeometry(0.54 * s, 0.06 * s, 0.34 * s)
      desk.translate(0, 0.36 * s, 0)
      const spine = new BoxGeometry(0.07 * s, 0.1 * s, 0.4 * s)
      spine.translate(0, 0.43 * s, 0)
      const parts: MarkerPart[] = [
        { geometry: post, color: BOARD_COLORS.darkBlue },
        { geometry: desk, color: BOARD_COLORS.darkBlue },
        { geometry: spine, color: BOARD_COLORS.darkBlue },
      ]
      // Two pages opening away from the spine in a shallow V.
      for (const side of [-1, 1]) {
        const page = new BoxGeometry(0.3 * s, 0.05 * s, 0.4 * s)
        page.rotateZ(side * -0.3)
        page.translate(side * 0.17 * s, 0.47 * s, 0)
        parts.push({ geometry: page, color: BOARD_COLORS.warmSand })
      }
      return parts
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
    // depthWrite off: a translucent overlay must not occlude in the depth
    // buffer or near-coplanar surfaces speckle
    new MeshBasicMaterial({
      color: BOARD_COLORS.ink,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    })
  )
  // Pawns rest 0.04 below the tile's top face (PAWN_REST_Y 0.6 vs rim 0.55 +
  // 0.09 disc inset) — 0.1 clears the face by a z-fight-proof margin
  shadow.position.y = 0.1

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
