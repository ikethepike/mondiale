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
  ExtrudeGeometry,
  PlaneGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GAUNTLET_LENGTH } from '~~/types/challenges/final-challenge.type'
import type { IndividualChallengeAccessorId } from '~~/types/challenges/individual-challenge.type'
import type { GameDifficulty, Tile } from '~~/types/game.types'
import { PHONE_MAX_PX } from '~~/lib/use-viewport'
import { CLIMAX_TILES } from '~~/lib/tiles'
import { createNumberAtlas } from './atlas'
import { BOARD_COLORS, TILE_TOP_TINTS } from './colors'
import { type ContourMaterial, createContourMaterial } from './contour-material'
import { OUTLINE_WIDTH_RATIO, outlineOf } from './ink-outline'
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
 *  key fingerprints every type — a same-length regeneration still rebuilds.
 *  Difficulty is in the key because it sizes the final mountain's ledges. */
export const boardBuildKey = (seed: string, tiles: Tile[], difficulty: GameDifficulty): string =>
  `${seed}:${difficulty}:${tiles.map(tile => tile.type).join(',')}`

export const getBoardBuild = (
  seed: string,
  tiles: Tile[],
  difficulty: GameDifficulty
): BoardBuild => {
  const key = boardBuildKey(seed, tiles, difficulty)
  if (cachedBuild?.key === key) return cachedBuild.build

  cachedBuild?.build.dispose()
  cachedBuild = { key, build: buildBoard(seed, tiles, difficulty) }
  return cachedBuild.build
}

// The landscape extends far past the playable square so contour lines fill
// the whole view at any camera angle; the shader fades them out toward the
// horizon so the world melts into the cream background.
const TERRAIN_OVERHANG = 2.6

/** Tile-disc proportions — shared with the /test-markers mock discs. */
export const TILE_RADIUS_RATIO = 0.42
export const TILE_RIM_HEIGHT = 0.55
export const TILE_TOP_INSET = 0.09

/**
 * Assemble the full static board: shelved contour terrain, the serpentine
 * track ribbon, instanced tile discs, tile numbers and challenge icons.
 * Deterministic per (seed, tiles) — every client builds the same board.
 */
const buildBoard = (seed: string, tiles: Tile[], difficulty: GameDifficulty): BoardBuild => {
  const group = new Group()

  // Edge falloff wraps the base field so hills subside into the page at the
  // horizon; the track (radius < EDGE_FADE_START) never feels it.
  const rawSampler = withEdgeFalloff(createHeightSampler(seed))
  const tilePath = createTilePath(seed, tiles, rawSampler)
  const { transforms, shelfPoints, spacing, chords } = tilePath

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
  const tileRadius = spacing * TILE_RADIUS_RATIO
  const rimHeight = TILE_RIM_HEIGHT

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
      new Vector3(position.x, position.y + rimHeight / 2 + TILE_TOP_INSET, position.z),
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
  buildChallengeMarkers(tiles, transforms, spacing, tileRadius, difficulty, chords).forEach(mesh =>
    group.add(mesh)
  )

  // --- Pond + bridge (when this board drew one) ------------------------------
  if (pondSite) {
    const tileTopY = pondSite.center.y + rimHeight + TILE_TOP_INSET
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

export interface MarkerPart {
  geometry: BufferGeometry
  color: string
  /** Opt out of the ink hull. For parts meeting another surface at a grazing
   *  angle, the inflated shell surfaces through the neighbour as black
   *  gashes — flush hardware (the lectern's mic mount) skips it. */
  outline?: boolean
}

export type MarkerType = IndividualChallengeAccessorId | 'final'

type MarkerRecipe = (s: number, stages?: number) => MarkerPart[]

/**
 * Local-space marker shapes per gate theme (y up, origin at tile ground, +z
 * pointing along the path). Chunky low-poly forms in the toon language: a
 * waving flag, a skyline for capitals, a compass rose for ISO codes, a
 * lectern for leaders, a bored coin for currencies, a sightseer's camera for
 * landmarks, crossed signposts for errata, a plume in an ink pot for the
 * lexicon, and a checkered finish gate spanning the final tile — physical
 * gates that read as a hard border to pass.
 *
 * Two rules earned the hard way. A marker must NAME its theme, not merely
 * differ from its neighbours (a blank stele is distinct and says nothing), and
 * it must survive the board's-eye camera, which looks DOWN: broad forms read,
 * thin and leaning ones vanish. Detail finer than a tier or a plate is lost to
 * the flat toon shading, so shapes have to work as silhouettes.
 */
/**
 * Flat-shade a geometry by giving every face its own normals.
 *
 * three.js interpolates normals across a cone's sides, which is right for a
 * many-segment cone and wrong for a four-segment one: the toon ramp smears a
 * gradient over each triangle instead of lighting it as a facet, and the shape
 * reads as a soft blob. Markers share one material per colour (they are merged
 * into a handful of draw calls), so `flatShading` on the material is not
 * available — the fix has to live in the geometry.
 */
const faceted = (geometry: BufferGeometry): BufferGeometry => {
  const flat = geometry.toNonIndexed()
  flat.computeVertexNormals()
  geometry.dispose()
  return flat
}

/**
 * The closed ink pot every lexicon variant stands its quill in: a squat belly
 * into a shoulder, then the rim curls inward to a recessed flat ink surface
 * on the axis. Watertight on purpose — an open mouth shows the outline
 * hull's backfaces as a ragged black maw.
 */
const inkPot = (s: number): BufferGeometry =>
  new LatheGeometry(
    [
      [0, 0],
      [0.235, 0],
      [0.265, 0.06],
      [0.25, 0.18],
      [0.198, 0.26],
      [0.196, 0.32],
      [0.155, 0.33],
      [0.145, 0.295],
      [0, 0.295],
    ].map(([radius, height]) => new Vector2(radius * s, height * s)),
    18
  )

/** Turns a quill so its blade quarters toward both the path-side and the
 *  board's-eye cameras — a flat blade parked in the x/y plane stands edge-on
 *  to the seat the game is actually watched from. */
const QUILL_YAW = 0.6

// A quill standing in an ink pot — writing names down. The mass IS the
// feather (a shaft with something stuck to it reads as a spatula): one broad
// upright plume. Picked over a swept-rachis quill and a bottle-and-nib in
// the 2026-08 marker review.
const lexiconPlume: MarkerRecipe = s => {
  // The barb separation is TWO overlapping vanes stacked in depth, never
  // notches cut into one outline. The separation line is then the front
  // vane's own silhouette ink over the back vane — constant width from
  // every seat, like every other part-over-part boundary in the set.
  // Notched single-outline versions were tried three ways (notched hull,
  // bridged envelope, valley envelope): each either filled the gap with an
  // ink slab or collapsed to a stray hairline at oblique angles.
  // The lobes are cut from the ORIGINAL notched outline: the front lobe
  // keeps the leading edge, tip and first barb verbatim; the back lobe is
  // the second barb and the lower sweep, tucked in under the valley. Their
  // union projects the original silhouette exactly.
  const front = new Shape()
  front.moveTo(0.02, 0.3)
  front.quadraticCurveTo(0.2, 0.6, 0.08, 1.0)
  front.quadraticCurveTo(0.04, 1.08, -0.03, 1.06)
  front.quadraticCurveTo(-0.1, 0.98, -0.11, 0.88)
  front.lineTo(-0.19, 0.9)
  front.quadraticCurveTo(-0.15, 0.76, -0.13, 0.66)
  front.quadraticCurveTo(-0.09, 0.5, -0.06, 0.36)
  // Stop SHORT of the start point — a duplicated first/last vertex hands the
  // triangulator a degenerate seam
  front.quadraticCurveTo(-0.03, 0.32, -0.005, 0.306)

  const back = new Shape()
  back.moveTo(-0.125, 0.665)
  back.lineTo(-0.21, 0.68)
  back.quadraticCurveTo(-0.15, 0.5, -0.06, 0.36)
  back.quadraticCurveTo(-0.095, 0.5, -0.125, 0.66)

  // Flat extrudes on purpose: a bevel folds over itself at reflex corners
  const frontVane = new ExtrudeGeometry(front, { depth: 0.06, bevelEnabled: false })
  frontVane.translate(0, 0, -0.03)
  const backVane = new ExtrudeGeometry(back, { depth: 0.06, bevelEnabled: false })
  backVane.translate(0, 0, -0.075)
  for (const vane of [frontVane, backVane]) {
    vane.scale(s, s, s)
    vane.rotateY(QUILL_YAW)
  }

  return [
    { geometry: inkPot(s), color: BOARD_COLORS.darkBlue },
    { geometry: backVane, color: BOARD_COLORS.warmSand },
    { geometry: frontVane, color: BOARD_COLORS.warmSand },
  ]
}

// An hourglass — time made furniture, for the history gate. The mass is the
// two sand cones meeting at the waist (warmSand, so the theme reads as SAND
// and not as a vase); the frame is two broad plates on three posts. From the
// board's-eye seat the plates and the waist silhouette carry it; the glass
// itself is omitted — a transparent shell is invisible to the toon ramp and
// a solid one reads as a barrel.
const historyHourglass: MarkerRecipe = s => {
  const plate = () => {
    const disc = new CylinderGeometry(0.32 * s, 0.34 * s, 0.08 * s, 14)
    return faceted(disc)
  }
  const base = plate()
  base.translate(0, 0.04 * s, 0)
  const cap = plate()
  cap.rotateX(Math.PI)
  cap.translate(0, 0.84 * s, 0)

  const posts: BufferGeometry[] = []
  for (let i = 0; i < 3; i++) {
    const post = new CylinderGeometry(0.035 * s, 0.035 * s, 0.72 * s, 8)
    const angle = (i / 3) * Math.PI * 2 + Math.PI / 6
    post.translate(Math.cos(angle) * 0.28 * s, 0.44 * s, Math.sin(angle) * 0.28 * s)
    posts.push(post)
  }

  // Lower pile (point up) and upper charge (point down), pinched at the waist.
  const sandDown = faceted(new ConeGeometry(0.23 * s, 0.3 * s, 12))
  sandDown.translate(0, 0.23 * s, 0)
  const sandUp = faceted(new ConeGeometry(0.23 * s, 0.3 * s, 12))
  sandUp.rotateX(Math.PI)
  sandUp.translate(0, 0.65 * s, 0)

  return [
    { geometry: base, color: BOARD_COLORS.darkBlue },
    { geometry: cap, color: BOARD_COLORS.darkBlue },
    ...posts.map(geometry => ({ geometry, color: BOARD_COLORS.darkBlue })),
    { geometry: sandDown, color: BOARD_COLORS.warmSand },
    { geometry: sandUp, color: BOARD_COLORS.warmSand },
  ]
}

// Cloth caught mid-ripple: an S-waved band drawn in plan and extruded
// upward, so the wave survives the board's-eye camera as a curling edge.
const flagWaving: MarkerRecipe = s => {
  const pole = new CylinderGeometry(0.045 * s, 0.045 * s, 0.95 * s, 10)
  pole.translate(0, 0.475 * s, 0)

  const band = new Shape()
  band.moveTo(0.02, 0.025)
  band.quadraticCurveTo(0.18, 0.115, 0.3, 0.025)
  band.quadraticCurveTo(0.42, -0.065, 0.5, -0.005)
  band.lineTo(0.5, -0.045)
  band.quadraticCurveTo(0.42, -0.105, 0.3, -0.02)
  band.quadraticCurveTo(0.18, 0.07, 0.02, -0.02)
  band.closePath()
  const cloth = new ExtrudeGeometry(band, { depth: 0.26, bevelEnabled: false })
  cloth.scale(s, s, s)
  cloth.rotateX(-Math.PI / 2)
  cloth.translate(0, 0.62 * s, 0)

  return [
    { geometry: pole, color: BOARD_COLORS.darkBlue },
    { geometry: cloth, color: BOARD_COLORS.hiorAnge },
  ]
}

/** Leans the ISO gate's rose off flat, face quartering back toward the
 *  arriving player — resting against its pedestal, not lying on it. */
const ROSE_TILT = 0.6

// A compass rose propped at a lean on a slim pedestal — wayfinding presented
// to the board's-eye camera: long cardinals, short diagonals. Picked over
// signposts, stamps, letter blocks, a luggage tag and two other compasses in
// the 2026-08 marker review. The pedestal stays inside the inter-tile gap
// (markers anchor at tileRadius * 1.05 ≈ 0.44 * s, the next tile's disc
// starts at 0.58 * s) — the old 0.38 * s drum sat well onto the neighbour.
const isoCompassRose: MarkerRecipe = s => {
  const drum = new CylinderGeometry(0.12 * s, 0.135 * s, 0.34 * s, 12)
  drum.translate(0, 0.17 * s, 0)

  const rose = new Shape()
  const POINTS = 16
  for (let point = 0; point < POINTS; point++) {
    const angle = (point / POINTS) * Math.PI * 2
    const radius = point % 2 ? 0.08 : point % 4 ? 0.18 : 0.31
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (point === 0) rose.moveTo(x, y)
    else rose.lineTo(x, y)
  }
  rose.closePath()
  const star = new ExtrudeGeometry(rose, { depth: 0.07, bevelEnabled: false })
  star.scale(s, s, s)

  // The hub pip rides the face, so it shares the star's lean.
  const pip = new CylinderGeometry(0.05 * s, 0.05 * s, 0.1 * s, 10)
  pip.rotateX(Math.PI / 2)
  pip.translate(0, 0, 0.11 * s)

  for (const piece of [star, pip]) {
    piece.rotateX(-Math.PI / 2 - ROSE_TILT)
    piece.translate(0, 0.47 * s, 0)
  }

  return [
    { geometry: faceted(drum), color: BOARD_COLORS.warmSand },
    { geometry: faceted(star), color: BOARD_COLORS.darkBlue },
    { geometry: pip, color: BOARD_COLORS.warmSand },
  ]
}

// Sightseeing made physical: a camera on a post, lens boring ACROSS the path
// (local x) for the same reason as the pin's eye — the board camera watches
// the path side-on.
const landmarksCamera: MarkerRecipe = s => {
  const pole = new CylinderGeometry(0.045 * s, 0.045 * s, 0.5 * s, 10)
  pole.translate(0, 0.25 * s, 0)
  const body = new BoxGeometry(0.22 * s, 0.3 * s, 0.46 * s)
  body.translate(0, 0.62 * s, 0)
  const lens = new CylinderGeometry(0.12 * s, 0.14 * s, 0.16 * s, 12)
  lens.rotateZ(Math.PI / 2)
  lens.translate(0.17 * s, 0.62 * s, 0)
  const shutter = new CylinderGeometry(0.045 * s, 0.045 * s, 0.06 * s, 8)
  shutter.translate(0, 0.8 * s, 0.14 * s)
  return [
    { geometry: pole, color: BOARD_COLORS.darkBlue },
    { geometry: body, color: BOARD_COLORS.darkBlue },
    { geometry: lens, color: BOARD_COLORS.warmSand },
    { geometry: shutter, color: BOARD_COLORS.warmSand },
  ]
}

// A fat coin stood on its edge — MINTED, not turned: a faceted rim, a struck
// border ring on each face, and the cash-coin square bored through the
// middle (the piece's own outline ring makes it read punched-through, not
// painted — the old pin's-eye trick). The slight yaw keeps a face catching
// light off-axis.
const currencyCoin: MarkerRecipe = s => {
  const plinth = new BoxGeometry(0.42 * s, 0.14 * s, 0.24 * s)
  plinth.translate(0, 0.07 * s, 0)
  const coin = new CylinderGeometry(0.28 * s, 0.28 * s, 0.11 * s, 14)
  coin.rotateX(Math.PI / 2)
  const hole = new BoxGeometry(0.13 * s, 0.13 * s, 0.16 * s)
  const pieces: MarkerPart[] = [
    { geometry: faceted(coin), color: BOARD_COLORS.warmSand },
    { geometry: hole, color: BOARD_COLORS.darkBlue },
  ]
  for (const side of [-1, 1]) {
    const ring = new TorusGeometry(0.21 * s, 0.02 * s, 8, 14)
    ring.translate(0, 0, side * 0.06 * s)
    pieces.push({ geometry: faceted(ring), color: BOARD_COLORS.darkBlue })
  }
  for (const piece of pieces) {
    piece.geometry.rotateY(0.2)
    piece.geometry.translate(0, 0.44 * s, 0)
  }
  return [{ geometry: plinth, color: BOARD_COLORS.darkBlue }, ...pieces]
}

// The address to the nation: a lectern with a microphone. Picked over the
// statue, sash, bust and throne in the 2026-08 marker review.
//
// The wand-thin mic keeps its original proportions; the fix for the awkward
// joint is the mount puck — a small desk-tilt-aligned cylinder swallowing
// the oblique stem/desk intersection so it reads as bolted-on hardware.
const leaderLectern: MarkerRecipe = s => {
  const DESK_TILT = -0.3
  const foot = new BoxGeometry(0.3 * s, 0.08 * s, 0.24 * s)
  foot.translate(0, 0.04 * s, 0)
  const post = new BoxGeometry(0.13 * s, 0.42 * s, 0.13 * s)
  post.translate(0, 0.25 * s, 0)
  const desk = new BoxGeometry(0.42 * s, 0.1 * s, 0.3 * s)
  desk.rotateX(DESK_TILT)
  desk.translate(0, 0.5 * s, 0)

  const mount = new CylinderGeometry(0.04 * s, 0.05 * s, 0.05 * s, 10)
  mount.rotateX(DESK_TILT)
  mount.translate(0, 0.545 * s, -0.093 * s)
  const stem = new CylinderGeometry(0.014 * s, 0.014 * s, 0.22 * s, 6)
  stem.rotateX(0.35)
  stem.translate(0, 0.63 * s, -0.05 * s)
  const mic = new SphereGeometry(0.035 * s, 8, 6)
  mic.translate(0, 0.73 * s, -0.09 * s)

  return [
    { geometry: foot, color: BOARD_COLORS.darkBlue },
    { geometry: post, color: BOARD_COLORS.darkBlue },
    { geometry: desk, color: BOARD_COLORS.warmSand },
    { geometry: mount, color: BOARD_COLORS.darkBlue, outline: false },
    { geometry: stem, color: BOARD_COLORS.darkBlue },
    { geometry: mic, color: BOARD_COLORS.darkBlue },
  ]
}

// The arch wearing a finish-line: a two-row checkered lintel over the pillars.
const finalCheckerGate: MarkerRecipe = s => {
  const parts: MarkerPart[] = []
  for (const side of [-1, 1]) {
    const pillar = new BoxGeometry(0.16 * s, 1.15 * s, 0.16 * s)
    pillar.translate(side * 0.5 * s, 0.575 * s, 0)
    parts.push({ geometry: pillar, color: BOARD_COLORS.darkBlue })
  }
  const COLUMNS = 7
  const cell = 0.16
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const square = new BoxGeometry(cell * s, cell * s, 0.2 * s)
      square.translate((column - (COLUMNS - 1) / 2) * cell * s, (1.16 + row * cell) * s, 0)
      parts.push({
        geometry: square,
        color: (row + column) % 2 ? BOARD_COLORS.sourMilk : BOARD_COLORS.ink,
      })
    }
  }
  return parts
}

// The capital as metropolis: three clustered towers, the tallest antennaed.
const capitalSkyline: MarkerRecipe = s => {
  const TOWERS: [number, number, number, string][] = [
    [-0.24, 0.5, -0.06, BOARD_COLORS.warmSand],
    [0, 0.88, 0.05, BOARD_COLORS.darkBlue],
    [0.24, 0.66, -0.04, BOARD_COLORS.warmSand],
  ]
  const parts: MarkerPart[] = TOWERS.map(([x, height, z, color]) => {
    const tower = new BoxGeometry(0.2 * s, height * s, 0.2 * s)
    tower.translate(x * s, (height / 2) * s, z * s)
    return { geometry: tower, color }
  })
  const antenna = new CylinderGeometry(0.018 * s, 0.018 * s, 0.16 * s, 8)
  antenna.translate(0, 0.96 * s, 0.05 * s)
  parts.push({ geometry: antenna, color: BOARD_COLORS.darkBlue })
  return parts
}

// The main peak of the final mountain: a faceted frustum, so the summit is a
// flat plateau a winner's pawn can actually stand on. Offset from the tile
// centre so the massif reads asymmetric. Steep on purpose — a squat cone
// reads as a lump, not a mountain.
const MOUNTAIN_PEAK = { x: 0.06, z: -0.05, radius: 0.46, height: 1.5, top: 0.07 }
/** Height where rock gives way to snow on the main peak. */
const SNOWLINE = 1.02

/**
 * Pawn-base anchors up the final mountain for an n-stage gauntlet: one flank
 * ledge per stage spiralling the main peak's +x face (the side the path
 * camera watches), then the summit plateau as the last entry. Local marker
 * space in spacing units. `finalMountain` carves a slab under each flank
 * anchor from this same list — sculpt and climb cannot drift.
 */
const mountainLedges = (stages: number): [number, number, number][] => {
  const flanks = Math.max(1, stages)
  const anchors: [number, number, number][] = []
  for (let step = 0; step < flanks; step++) {
    const t = flanks === 1 ? 0.5 : step / (flanks - 1)
    const y = 0.3 + 0.8 * t
    const angle = -0.7 + 1.4 * t
    const reach = MOUNTAIN_PEAK.radius * (1 - y / MOUNTAIN_PEAK.height) + 0.13
    anchors.push([
      MOUNTAIN_PEAK.x + Math.cos(angle) * reach,
      y,
      MOUNTAIN_PEAK.z + Math.sin(angle) * reach,
    ])
  }
  anchors.push([MOUNTAIN_PEAK.x, 1.56, MOUNTAIN_PEAK.z])
  return anchors
}

// Mount Olympus for the final tile: an asymmetric three-peak massif — snow
// on the two tall peaks — with one carved ledge per gauntlet stage
// spiralling the main face. TopoScene stands a challenger's pawn on the
// ledge matching their cleared-stage count (finalClimbAnchor), so the whole
// room watches the climb; the summit plateau is the victory stand.
const finalMountain: MarkerRecipe = (s, stages = GAUNTLET_LENGTH.normal) => {
  const parts: MarkerPart[] = []

  const peak = new CylinderGeometry(
    MOUNTAIN_PEAK.top * s,
    MOUNTAIN_PEAK.radius * s,
    MOUNTAIN_PEAK.height * s,
    7
  )
  peak.translate(MOUNTAIN_PEAK.x * s, (MOUNTAIN_PEAK.height / 2) * s, MOUNTAIN_PEAK.z * s)
  parts.push({ geometry: faceted(peak), color: BOARD_COLORS.warmSand })

  // The snow CONTINUES the peak's own taper — computed from the rock's radius
  // at the snowline plus a hair, so it caps the summit instead of flaring
  // over it like a lampshade. Half a facet out of phase → the snowline
  // zigzags. Its flat top is the summit plateau.
  const snowBottom = MOUNTAIN_PEAK.radius * (1 - SNOWLINE / MOUNTAIN_PEAK.height) + 0.03
  const snowHeight = MOUNTAIN_PEAK.height + 0.06 - SNOWLINE
  const snow = new CylinderGeometry(
    (MOUNTAIN_PEAK.top + 0.03) * s,
    snowBottom * s,
    snowHeight * s,
    7
  )
  snow.rotateY(Math.PI / 7)
  snow.translate(MOUNTAIN_PEAK.x * s, (SNOWLINE + snowHeight / 2) * s, MOUNTAIN_PEAK.z * s)
  parts.push({ geometry: faceted(snow), color: BOARD_COLORS.sourMilk })

  const shoulder = new ConeGeometry(0.3 * s, 0.95 * s, 6)
  shoulder.translate(-0.38 * s, 0.475 * s, 0.16 * s)
  parts.push({ geometry: faceted(shoulder), color: BOARD_COLORS.warmSand })
  const shoulderSnow = new ConeGeometry(0.11 * s, 0.3 * s, 6)
  shoulderSnow.translate(-0.38 * s, 0.83 * s, 0.16 * s)
  parts.push({ geometry: faceted(shoulderSnow), color: BOARD_COLORS.sourMilk })

  const foothill = new ConeGeometry(0.24 * s, 0.5 * s, 6)
  foothill.translate(0.14 * s, 0.25 * s, -0.42 * s)
  parts.push({ geometry: faceted(foothill), color: BOARD_COLORS.warmSand })

  mountainLedges(stages)
    .slice(0, -1)
    .forEach(([x, y, z]) => {
      const inward = Math.atan2(z - MOUNTAIN_PEAK.z, x - MOUNTAIN_PEAK.x)
      const slab = new BoxGeometry(0.26 * s, 0.07 * s, 0.26 * s)
      slab.rotateY(-inward)
      slab.translate(
        (x - Math.cos(inward) * 0.08) * s,
        (y - 0.035) * s,
        (z - Math.sin(inward) * 0.08) * s
      )
      parts.push({ geometry: slab, color: BOARD_COLORS.darkBlue })
    })
  return parts
}

/**
 * Where a climbing pawn stands after clearing `cleared` of `total` gauntlet
 * stages on a `stages`-ledge mountain: one ledge per stage when the deal is
 * full-length, a proportional ledge when a thin board dealt fewer, and the
 * summit at `cleared >= total` (victory). Local marker space — callers
 * rotate by the tile's path yaw and add the tile position. Returns undefined
 * while the shipping final marker has no ledges to stand on.
 */
export const finalClimbAnchor = (
  cleared: number,
  total: number,
  spacing: number,
  stages: number
): Vector3 | undefined => {
  if (Object.keys(MARKER_VARIANTS.final)[0] !== 'mountain') return undefined
  if (cleared <= 0 || total <= 0) return undefined

  const anchors = mountainLedges(stages)
  const flankCount = anchors.length - 1
  const ledge =
    cleared >= total
      ? anchors[anchors.length - 1]
      : anchors[Math.min(flankCount - 1, Math.ceil((cleared / total) * flankCount) - 1)]
  return new Vector3(ledge[0], ledge[1], ledge[2]).multiplyScalar(spacing)
}

/** Candidate sculpts under review — the FIRST entry of each set is the
 *  production default; /test-markers flips between them live. Once a winner
 *  is picked it gets baked into its `markerPartsFor` case and its set leaves
 *  this map (picked 2026-08: lexicon plume, waving flag, capital skyline,
 *  landmarks camera, currency coin). `final` leads with the mountain so the
 *  gauntlet climb is live — see finalClimbAnchor. */
export const MARKER_VARIANTS = {
  // Checker-gate ships; the mountain stays as the lab alternate carrying the
  // dormant gauntlet-climb feature (finalClimbAnchor only activates when the
  // mountain leads this set).
  final: {
    'checker-gate': finalCheckerGate,
    mountain: finalMountain,
  },
} as const

export const markerPartsFor = (
  type: MarkerType,
  spacing: number,
  variant?: string,
  stages?: number
): MarkerPart[] => {
  const s = spacing
  switch (type) {
    case 'final': {
      const variants: Record<string, MarkerRecipe> = MARKER_VARIANTS[type]
      return ((variant ? variants[variant] : undefined) ?? Object.values(variants)[0])(s, stages)
    }
    case 'isoCode':
      return isoCompassRose(s)
    case 'government.leader':
      return leaderLectern(s)
    case 'flag':
      return flagWaving(s)
    case 'capital.name':
      return capitalSkyline(s)
    case 'landmarks':
      return landmarksCamera(s)
    case 'currency':
      return currencyCoin(s)
    case 'lexicon':
      return lexiconPlume(s)
    case 'history':
      return historyHourglass(s)
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
  }
}

/**
 * All challenge markers merged by color (a handful of draw calls total):
 * toon-shaded structures plus one ink inverted-hull outline mesh.
 */
/**
 * The clear run between this tile's disc edge and the next one's, from the
 * LOCAL chord rather than `spacing` (an average arc length that reads too
 * generous through turns).
 *
 * It is small — 0.4 to 2.2 world units across every board length — which is
 * the fact that decides where markers can stand. They are authored at ~1.5x
 * the tile radius; nothing in the set fits between two discs, and shrinking
 * one until it did would leave a speck. Markers therefore stand ON their own
 * tile, and this gap is what keeps a marker off the NEIGHBOURING disc.
 */
export const markerGapFor = (index: number, chords: number[], tileRadius: number): number =>
  Math.max(0, (chords[index] ?? 0) - tileRadius * 2)

/**
 * How far a marker must shrink to stand in its berth beside the tile, as a
 * uniform factor (uniform so the authored silhouette survives — a per-axis
 * squash would not).
 *
 * A hurdle is DELIBERATELY allowed to overhang the discs it stands between:
 * that overlap is what reads as barring the way, and the gap (0.4–2.2 world
 * units against art authored at ~1.5x the tile radius) is far too narrow to
 * contain a marker — fitting one strictly inside it shrinks the art to under
 * 1% of its size, an invisible speck. What made the OLD placement a bug was
 * not the overhang but the height: markers were planted at tile ground while
 * their recipes are authored from their own foot, so every base part sat
 * 0.55–0.64 BELOW the disc's top face, buried in the rim cylinder and
 * surfacing through it as black outline gashes.
 *
 * So the cap is generous — it exists only to stop a marker sprawling across a
 * whole neighbouring tile — and standing at the top face is what actually
 * fixed the intersection.
 */
export const markerFitFactor = (parts: MarkerPart[], tileRadius: number, gap: number): number => {
  let depth = 0
  for (const part of parts) {
    part.geometry.computeBoundingBox()
    const box = part.geometry.boundingBox
    if (!box) continue
    depth = Math.max(depth, Math.abs(box.min.z), Math.abs(box.max.z))
  }

  // Reach across the gap and over the neighbour's near half, no further.
  const budget = gap / 2 + tileRadius
  if (budget <= 0 || depth <= 0 || depth <= budget) return 1
  return budget / depth
}

const buildChallengeMarkers = (
  tiles: Tile[],
  transforms: TileTransform[],
  spacing: number,
  tileRadius: number,
  difficulty: GameDifficulty,
  chords: number[]
): Mesh[] => {
  const colorBuckets = new Map<string, BufferGeometry[]>()
  const outlines: BufferGeometry[] = []
  const outlineWidth = spacing * OUTLINE_WIDTH_RATIO
  const matrix = new Matrix4()
  const quaternion = new Quaternion()
  const up = new Vector3(0, 1, 0)

  for (const tile of tiles) {
    if (tile.type === 'normal' || tile.type === 'start') continue

    const { position, tangent } = transforms[tile.position]
    const isFinal = tile.type === 'final'
    const parts = markerPartsFor(
      isFinal ? 'final' : tile.type,
      spacing,
      undefined,
      GAUNTLET_LENGTH[difficulty]
    )

    // A gate is a HURDLE: it stands in the path itself, at the tile's exit
    // edge, so the pawn pulls up and is stopped by the thing barring its way.
    // The final arch spans its own tile instead.
    //
    // It sits in the gap between this disc and the next, and that gap is the
    // whole budget. It used to be reasoned from `spacing` — the curve's
    // AVERAGE arc length — but the real chord runs 0.84–0.92 of it, leaving
    // 0.4–2.2 world units where the old `tileRadius * 1.05` assumed far more:
    // the hourglass overhung the NEXT disc by ~3 units and reached back inside
    // its own. Centring the marker in the measured gap and scaling it to fit
    // is what keeps a hurdle a hurdle instead of a collision.
    const gap = markerGapFor(tile.position, chords, tileRadius)
    // Markers are authored at ~1.5x the tile radius, so standing in a gap this
    // narrow genuinely needs the shrink. Uniform, so the authored silhouette
    // survives; baked in here because the parts are merged by colour below and
    // have no transform of their own afterwards.
    const fit = isFinal ? 1 : markerFitFactor(parts, tileRadius, gap)
    // Dead centre of the gap: equal clearance to the disc behind and ahead.
    const anchor = isFinal
      ? position.clone()
      : position.clone().addScaledVector(tangent, tileRadius + gap / 2)
    // The recipes are authored from the marker's own foot, so a ground anchor
    // buried every base part 0.55–0.64 BELOW the disc's top face — inside the
    // rim cylinder. The gap floor is terrain, not disc, so a hurdle stands at
    // the same height as the tops it bars: level with the disc's top face.
    anchor.y += TILE_RIM_HEIGHT + TILE_TOP_INSET
    quaternion.setFromAxisAngle(up, Math.atan2(tangent.x, tangent.z))
    matrix.compose(anchor, quaternion, new Vector3(fit, fit, fit))

    for (const part of parts) {
      // mergeGeometries refuses a bucket where some geometries carry an index
      // and others don't, and `faceted()` has to drop the index to give a part
      // its own face normals. Normalising everything to non-indexed keeps the
      // buckets mergeable; it duplicates vertices but carries the existing
      // normals across, so nothing that wasn't faceted changes appearance.
      const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry
      if (geometry !== part.geometry) part.geometry.dispose()

      if (part.outline !== false) {
        const outline = outlineOf(geometry, outlineWidth)
        outline.applyMatrix4(matrix)
        outlines.push(outline)
      }

      geometry.applyMatrix4(matrix)
      const bucket = colorBuckets.get(part.color) ?? []
      bucket.push(geometry)
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
  // Deliberately NOT outlineOf: reusing the body geometry and scaling the
  // mesh costs zero extra buffers per pawn, and a scaled hull is sound on
  // this convex closed lathe.
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

/** Crowns draw with a finer pen — the spikes are the smallest outlined solids
 *  on the board, and the marker-width stroke would drown them. */
const CROWN_OUTLINE_RATIO = 0.01

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

  const outlines = parts.map(part => outlineOf(part, height * CROWN_OUTLINE_RATIO))
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
