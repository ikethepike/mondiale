import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  FloatType,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
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
  RedFormat,
  RingGeometry,
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
import { prefersReducedMotion } from '~~/lib/motion'
import { CLIMAX_TILES } from '~~/lib/tiles'
import { createNumberAtlas } from './atlas'
import { BOARD_COLORS, TILE_TOP_TINTS } from './colors'
import { type ContourMaterial, createContourMaterial } from './contour-material'
import { buildContourLabels, pickContourLabels } from './contour-labels'
import { OUTLINE_WIDTH_RATIO, outlineOf } from './ink-outline'
import { createTilePath, TILE_RADIUS_RATIO, type TileTransform, type TrackArchetype } from './path'
import { type BoardBiome, pickBoardBiome } from './biomes'
import { buildRailway, pickRailwayRoute } from './railway'
import { lakeShoreDistance, pickLakeSite, withLakeBed } from './lake'
import { pickRiverPath, type RiverPath, withRiverBed } from './river'
import {
  pickScenerySites,
  pickWaymarkSites,
  type ScenerySites,
  type WaymarkSite,
} from './scenery'
import { pickSummitSite, type SummitSite, withSummitMassif } from './summit'
import { pickTownSite, type TownSite } from './town'
import {
  BOARD_SIZE,
  createHeightSampler,
  type HeightSampler,
  MAX_ELEVATION,
  withEdgeFalloff,
  withPathShelf,
} from './terrain'
import {
  buildLakeMeshes,
  buildPlankBridge,
  buildPondMeshes,
  createWaterMaterial,
  pickPondSite,
  withPondBasin,
} from './water'
import { buildFlora, windMaterial } from './flora'
import { type BoatMooring, pickBoatMooring } from './boat'

export interface BoardBuild {
  group: Group
  transforms: TileTransform[]
  spacing: number
  archetype: TrackArchetype
  /** The board's landscape voice — game pieces never read it. */
  biome: BoardBiome
  /** Clocks of every animated landscape shader (wind, water, birds, clouds);
   *  TopoScene advances them while the stage is visible. */
  timeUniforms: { value: number }[]
  /** Per-frame object animators (the railway's train) — driven by the same
   *  ticker as the shader clocks, so everything pauses and stills together. */
  animations: ((time: number) => void)[]
  /** The finale massif, when this board dealt one — TopoScene climbs its
   *  `climbAnchors` during the gauntlet. */
  summit?: SummitSite
  /** The railway loop, when this board dealt one — the dev camera pin. */
  railway?: Vector3[]
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

/** Tile-disc proportions. The radius ratio lives in path.ts (the clearance
 *  guard is defined in disc terms and path.ts must not import this module) —
 *  re-exported here for the marker/test callers that always read it here. */
export { TILE_RADIUS_RATIO }
export const TILE_RIM_HEIGHT = 0.55
export const TILE_TOP_INSET = 0.09

/**
 * The overlay ladder: y-lifts above a tile's ground point for everything that
 * floats over a disc. Coplanar overlays z-fight into flickering speckles, so
 * every rung keeps clear air to its neighbours — a new overlay takes a new
 * rung here, never an inline literal.
 */
export const TILE_TOP_LIFT = TILE_RIM_HEIGHT + TILE_TOP_INSET // the disc's top face
export const HIGHLIGHT_RING_LIFT = 0.68
export const NUMBER_LABEL_LIFT = 0.71
export const PATH_MARKER_LIFT = 0.75

/**
 * Assemble the full static board: shelved contour terrain, the serpentine
 * track ribbon, instanced tile discs, tile numbers and challenge icons.
 * Deterministic per (seed, tiles) — every client builds the same board.
 */
const buildBoard = (seed: string, tiles: Tile[], difficulty: GameDifficulty): BoardBuild => {
  const group = new Group()

  // The landscape's voice: ramps, inks and noise character. Game pieces
  // (discs, markers, pawns) never read it — they stay cream-and-ink.
  const biome = pickBoardBiome(seed)

  // Every animated shader registers its clock here; TopoScene advances them
  // only while the stage is on screen (the parked render loop stays parked).
  const timeUniforms: { value: number }[] = []

  // Edge falloff wraps the base field so hills subside into the page at the
  // horizon; the track (radius < EDGE_FADE_START) never feels it.
  const rawSampler = withEdgeFalloff(createHeightSampler(seed, biome))
  const tilePath = createTilePath(seed, tiles, rawSampler)
  const { transforms, shelfPoints, spacing, chords } = tilePath

  // A rare decorative pond: one plain tile trades its disc for a plank
  // bridge over basin-carved water. Purely visual — the tile stays 'normal'.
  const pondSite = pickPondSite(seed, tiles, tilePath)

  // The finale massif: a terrain mountain beyond the final tile that the
  // gauntlet climbs. Sited off-track by construction, so the shelf and the
  // flank never fight and track elevation stays untouched.
  const summitSite = pickSummitSite(
    seed,
    tilePath,
    pondSite,
    rawSampler,
    GAUNTLET_LENGTH[difficulty]
  )

  // A decorative river: rises on open high ground, marches downhill, stops
  // at the track's clearance. Carved into the bed the shader contours draw.
  const riverPath = pickRiverPath(seed, tilePath, pondSite, summitSite, rawSampler)

  const shelved = withPathShelf(rawSampler, shelfPoints, spacing * 1.05)
  const ponded = pondSite ? withPondBasin(shelved, pondSite) : shelved
  const sculpted = summitSite ? withSummitMassif(ponded, summitSite, spacing) : ponded
  const rivered = riverPath ? withRiverBed(sculpted, riverPath) : sculpted

  // A discovered lake: a natural depression flood-filled to just under its
  // spill saddle. Sited over the composed terrain, then its bed assist joins
  // the chain — the discovered shoreline itself never moves.
  const lakeSite = pickLakeSite(seed, tilePath, pondSite, summitSite, riverPath, rivered)
  const sampler = lakeSite ? withLakeBed(rivered, lakeSite) : rivered

  // --- Terrain -------------------------------------------------------------
  const segments = typeof window !== 'undefined' && window.innerWidth <= PHONE_MAX_PX ? 220 : 300
  const terrainSize = BOARD_SIZE * TERRAIN_OVERHANG
  const terrainGeometry = new PlaneGeometry(terrainSize, terrainSize, segments, segments)
  terrainGeometry.rotateX(-Math.PI / 2)

  const positions = terrainGeometry.attributes.position
  const slopes = new Float32Array(positions.count)
  const gradients = new Float32Array(positions.count * 2)
  const curvatures = new Float32Array(positions.count)
  const moistures = new Float32Array(positions.count)
  const epsilon = terrainSize / segments

  // Analytic distance to the nearest water body — the moisture field that
  // greens the banks (and the desert's oasis ring) in the shader.
  const waterDistanceAt = (x: number, z: number) => {
    let distance = Infinity
    if (pondSite)
      distance = Math.max(
        0,
        Math.hypot(pondSite.center.x - x, pondSite.center.z - z) - pondSite.waterRadius
      )
    if (riverPath) {
      for (const point of riverPath.points) {
        const d = Math.hypot(point.x - x, point.z - z)
        if (d < distance) distance = d
      }
    }
    if (lakeSite) {
      const d = lakeShoreDistance(lakeSite, x, z)
      if (d < distance) distance = d
    }
    return distance
  }

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
    gradients[index * 2] = gradientX
    gradients[index * 2 + 1] = gradientZ
    // Laplacian: negative on ridgelines, positive in hollows — curvature ink.
    curvatures[index] =
      heights[row * lattice + right] +
      heights[row * lattice + left] +
      heights[far * lattice + column] +
      heights[near * lattice + column] -
      4 * heights[index]
    const wet = waterDistanceAt(positions.getX(index), positions.getZ(index))
    moistures[index] = wet === Infinity ? 0 : 1 - Math.min(1, wet / 9)
  }
  positions.needsUpdate = true
  terrainGeometry.setAttribute('aSlope', new BufferAttribute(slopes, 1))
  terrainGeometry.setAttribute('aGradient', new BufferAttribute(gradients, 2))
  terrainGeometry.setAttribute('aCurve', new BufferAttribute(curvatures, 1))
  terrainGeometry.setAttribute('aMoisture', new BufferAttribute(moistures, 1))

  // The height field again at texture resolution, finer than the mesh:
  // fragment-space contours never crumble along triangle edges.
  // One size everywhere: the phone's 384² tier made contour lines visibly
  // softer than the rest of the ink, and the full field is a 1MB texture.
  const fieldSize = 512
  const fieldHalf = terrainSize / 2
  const field = new Float32Array(fieldSize * fieldSize)
  for (let row = 0; row < fieldSize; row++) {
    for (let column = 0; column < fieldSize; column++) {
      const x = (column / (fieldSize - 1)) * terrainSize - fieldHalf
      const z = (row / (fieldSize - 1)) * terrainSize - fieldHalf
      field[row * fieldSize + column] = sampler(x, z)
    }
  }
  const heightMap = new DataTexture(field, fieldSize, fieldSize, RedFormat, FloatType)
  heightMap.minFilter = LinearFilter
  heightMap.magFilter = LinearFilter
  heightMap.needsUpdate = true

  // The snowline: a finale massif brings its own; an ice board carries a
  // standing one on every crest. Both dealt — the lower line wins.
  const biomeSnowline =
    biome.snowlineFraction === undefined ? undefined : MAX_ELEVATION * biome.snowlineFraction
  const snowlineY =
    summitSite && biomeSnowline !== undefined
      ? Math.min(summitSite.snowlineY, biomeSnowline)
      : (summitSite?.snowlineY ?? biomeSnowline)

  const contourMaterial = createContourMaterial({
    rippleRadius: spacing * 4,
    biome,
    heightMap,
    heightHalf: fieldHalf,
    snowlineY,
  })
  timeUniforms.push(contourMaterial.uniforms.uTime as { value: number })
  group.add(new Mesh(terrainGeometry, contourMaterial))

  // --- Track ribbon ----------------------------------------------------------
  const ribbonCurve = new CatmullRomCurve3(
    shelfPoints.map(point => new Vector3(point.x, point.y + 0.18, point.z))
  )
  const tubularSegments = tiles.length * 6
  const ribbonGeometry = new TubeGeometry(ribbonCurve, tubularSegments, 0.16, 6, false)

  // Approach telegraphing: the ribbon warms into each gate's wash over the
  // last stretch of track before it, so a coming gauntlet reads at overview
  // zoom where the marker itself is small. Per-vertex colors — TubeGeometry
  // orders vertices ring-major, so ring i maps to curve parameter i/segments.
  const APPROACH_TILES = 1.15
  const ribbonBase = new Color(BOARD_COLORS.softBlue)
  const ringColor = new Color()
  const ribbonColors = new Float32Array(ribbonGeometry.attributes.position.count * 3)
  const gateTints = tiles.flatMap(tile => {
    if (tile.type === 'normal' || tile.type === 'start') return []
    return {
      position: tile.position,
      tint: new Color(tile.type === 'final' ? BOARD_COLORS.hiorAnge : TILE_TOP_TINTS[tile.type]),
    }
  })
  const ringsPerVertexRow = ribbonGeometry.attributes.position.count / (tubularSegments + 1)
  for (let ring = 0; ring <= tubularSegments; ring++) {
    const tileAt = (ring / tubularSegments) * (tiles.length - 1)
    ringColor.copy(ribbonBase)
    for (const gate of gateTints) {
      const ahead = gate.position - tileAt
      if (ahead >= 0 && ahead <= APPROACH_TILES) {
        ringColor.lerp(gate.tint, 1 - ahead / APPROACH_TILES)
        break
      }
    }
    for (let around = 0; around < ringsPerVertexRow; around++) {
      const vertex = ring * ringsPerVertexRow + around
      ribbonColors[vertex * 3] = ringColor.r
      ribbonColors[vertex * 3 + 1] = ringColor.g
      ribbonColors[vertex * 3 + 2] = ringColor.b
    }
  }
  ribbonGeometry.setAttribute('color', new BufferAttribute(ribbonColors, 3))

  const ribbonMaterial = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.35,
  })
  group.add(new Mesh(ribbonGeometry, ribbonMaterial))

  // --- Tile discs (two instanced meshes: ink rim + colored top) -------------
  const tileRadius = spacing * TILE_RADIUS_RATIO
  const rimHeight = TILE_RIM_HEIGHT

  const unitDisc = new CylinderGeometry(1, 1, 1, 28)
  // White base + per-instance colors: plain rims stay ink, gate rims carry a
  // darkened theme tint — the second half of the approach telegraph.
  const rimMesh = new InstancedMesh(
    unitDisc,
    new MeshBasicMaterial({ color: '#ffffff' }),
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
  const rimColor = new Color()
  const rimInk = new Color(BOARD_COLORS.ink)
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

    // Gate rims wear their theme's wash pulled well toward ink — colored
    // enough to flag "gate ahead" at overview zoom, dark enough to stay the
    // disc's border in the outline language.
    rimColor.copy(rimInk)
    if (tile.type !== 'normal' && tile.type !== 'start' && tile.type !== 'final') {
      rimColor.set(TILE_TOP_TINTS[tile.type]).lerp(rimInk, 0.55)
    }
    rimMesh.setColorAt(index, rimColor)

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
  if (rimMesh.instanceColor) rimMesh.instanceColor.needsUpdate = true
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
      quad.translate(position.x, position.y + NUMBER_LABEL_LIFT, position.z)
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
  if (summitSite) {
    buildSummitCairn(summitSite, spacing).forEach(mesh => group.add(mesh))
    buildClimbPlatforms(summitSite, spacing).forEach(mesh => group.add(mesh))
  }

  if (riverPath) {
    buildRiverMeshes(riverPath, biome, sampler, timeUniforms).forEach(mesh => group.add(mesh))
    // A bridged track crossing wears the pond's plank deck: apex at the
    // track's own resting height, run along the track's tangent.
    for (const crossing of riverPath.crossings) {
      const deckTopY = crossing.center.y + rimHeight + TILE_TOP_INSET
      buildPlankBridge(crossing.center, crossing.tangent, spacing, deckTopY).forEach(mesh =>
        group.add(mesh)
      )
    }
  }

  if (lakeSite)
    buildLakeMeshes(seed, lakeSite, biome, sampler, timeUniforms).forEach(mesh =>
      group.add(mesh)
    )

  // Survey furniture on the open terrain: cairned hilltops and a compass-rose
  // ink decal. Heights come from the final composed sampler, so everything
  // sits exactly on the rendered ground.
  const scenery = pickScenerySites(
    seed,
    tilePath,
    pondSite,
    summitSite,
    sampler,
    riverPath,
    lakeSite
  )
  scenery.cairns.forEach(site => buildHillCairn(site, spacing).forEach(mesh => group.add(mesh)))
  if (scenery.compass) group.add(buildCompassRose(scenery.compass, spacing, sampler))
  if (scenery.stones)
    buildStandingStones(scenery.stones, spacing, sampler).forEach(mesh => group.add(mesh))
  if (scenery.scaleBar) group.add(buildScaleBar(scenery.scaleBar, sampler))
  if (scenery.basecamp)
    buildBasecamp(scenery.basecamp, spacing, timeUniforms).forEach(mesh => group.add(mesh))

  const animations: ((time: number) => void)[] = []

  // A rowboat moored on the board's still water — lake first, else pond.
  const mooring = pickBoatMooring(seed, pondSite, lakeSite, spacing, sampler)
  if (mooring) {
    const boat = buildRowboat(mooring, spacing)
    group.add(boat.group)
    animations.push(boat.animate)
  }

  // The hamlet: a huddle of houses and one tower around a lane, dressed in
  // the biome's palette. Sited after the survey furniture, before the
  // railway — later features yield to it, it yields to everything earlier.
  const townSite = pickTownSite(
    seed,
    tilePath,
    pondSite,
    summitSite,
    riverPath,
    scenery,
    sampler,
    lakeSite
  )
  if (townSite) {
    const town = buildTownMeshes(townSite, biome, spacing, sampler)
    town.meshes.forEach(mesh => group.add(mesh))
    if (town.animate) animations.push(town.animate)
  }

  pickWaymarkSites(
    tilePath,
    pondSite,
    summitSite,
    riverPath,
    scenery,
    sampler,
    lakeSite,
    townSite
  ).forEach(site => buildWaymark(site, spacing).forEach(mesh => group.add(mesh)))

  // A decorative railway for certain seeds: a closed contour loop OR an
  // edge-to-edge traverse off the sheet, with an old steam train riding it.
  // Picked LAST among the placements, so it is always the feature that
  // yields — the ticker drives it via `animations`.
  const railwayRoute = pickRailwayRoute(
    seed,
    tilePath,
    pondSite,
    summitSite,
    riverPath,
    scenery,
    sampler,
    lakeSite,
    townSite
  )
  const railwayLoop = railwayRoute?.points
  if (railwayRoute) {
    const railway = buildRailway(railwayRoute, biome, sampler)
    railway.meshes.forEach(mesh => group.add(mesh))
    animations.push(railway.drive)
  }

  // Elevation labels along the major contour lines — sited after the rails
  // so no number ends up under a sleeper.
  const labelPlan = pickContourLabels(sampler, tilePath, {
    pond: pondSite,
    summit: summitSite,
    river: riverPath,
    railway: railwayLoop,
    lake: lakeSite,
    town: townSite,
    snowlineY,
  })
  const contourLabels = buildContourLabels(labelPlan, biome)
  if (contourLabels) group.add(contourLabels)

  // The living layer: blade grass, biome props, gull flocks — all wind-swayed
  // in the vertex shader, all clear of the track, stilled by reduced motion.
  buildFlora(
    {
      biome,
      path: tilePath,
      pond: pondSite,
      summit: summitSite,
      river: riverPath,
      lake: lakeSite,
      town: townSite,
      railway: railwayLoop,
      sampler,
      waterDistanceAt,
      seed,
      phone: typeof window !== 'undefined' && window.innerWidth <= PHONE_MAX_PX,
    },
    timeUniforms
  ).forEach(mesh => group.add(mesh))

  buildChallengeMarkers(tiles, transforms, spacing, tileRadius, chords).forEach(mesh =>
    group.add(mesh)
  )

  // --- Pond + bridge (when this board drew one) ------------------------------
  if (pondSite) {
    const tileTopY = pondSite.center.y + rimHeight + TILE_TOP_INSET
    buildPondMeshes(seed, pondSite, spacing, tileTopY, biome, sampler, timeUniforms).forEach(
      mesh => group.add(mesh)
    )
  }

  const dispose = () => {
    heightMap.dispose()
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

  return {
    group,
    transforms,
    spacing,
    archetype: tilePath.archetype,
    biome,
    timeUniforms,
    animations,
    summit: summitSite,
    railway: railwayLoop,
    contourMaterial,
    dispose,
  }
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

type MarkerRecipe = (s: number) => MarkerPart[]

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

  // Flat extrudes on purpose: a bevel folds over itself at reflex corners.
  // Vane depth 0.06 → 0.09 after the overview-zoom pass: the blade thinned
  // to a hairline at framing distance. The back vane keeps its tuck-behind
  // overlap (front spans −0.045…0.045, back −0.12…−0.03).
  const frontVane = new ExtrudeGeometry(front, { depth: 0.09, bevelEnabled: false })
  frontVane.translate(0, 0, -0.045)
  const backVane = new ExtrudeGeometry(back, { depth: 0.09, bevelEnabled: false })
  backVane.translate(0, 0, -0.12)
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

  const parts: MarkerPart[] = [
    { geometry: base, color: BOARD_COLORS.darkBlue },
    { geometry: cap, color: BOARD_COLORS.darkBlue },
    ...posts.map(geometry => ({ geometry, color: BOARD_COLORS.darkBlue })),
    { geometry: sandDown, color: BOARD_COLORS.warmSand },
    { geometry: sandUp, color: BOARD_COLORS.warmSand },
  ]
  // The heaviest silhouette in the set by ~2× (measured AABB mass 210 vs the
  // 23–166 of everything else) — trimmed uniformly toward the pack so no one
  // gate dominates the overview shot. Uniform about the foot, so the
  // authored-from-origin invariant holds.
  parts.forEach(part => part.geometry.scale(0.86, 0.86, 0.86))
  return parts
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

export const markerPartsFor = (type: MarkerType, spacing: number): MarkerPart[] => {
  const s = spacing
  switch (type) {
    case 'final':
      // The checkered arch — the finale massif (see summit.ts) replaced the
      // old marker-mesh mountain, which could never read as one at gap scale.
      return finalCheckerGate(s)
    case 'isoCode':
      return isoCompassRose(s)
    case 'government.leader':
    case 'government.parties':
      // One lectern for both political gates: a party is what someone stands
      // at a lectern to speak for, and the set already pairs errata with the
      // ISO signpost on the same reasoning. The clay tile top is what tells
      // them apart — a second boxy plinth would read as a near-duplicate at
      // board scale without adding meaning.
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
      // Thickened from 0.045/0.2/0.05 after the overview-zoom pass: the
      // lightest silhouette in the set (AABB mass 23 vs the hourglass's 210)
      // vanished at framing distance.
      const pole = new CylinderGeometry(0.06 * s, 0.06 * s, 0.95 * s, 10)
      pole.translate(0, 0.475 * s, 0)
      const lower = new BoxGeometry(0.52 * s, 0.24 * s, 0.09 * s)
      lower.rotateZ(-0.21)
      lower.translate(0, 0.5 * s, 0)
      const upper = new BoxGeometry(0.52 * s, 0.24 * s, 0.09 * s)
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
    const parts = markerPartsFor(isFinal ? 'final' : tile.type, spacing)

    // A gate is a HURDLE: it stands in the path itself, at the tile's exit
    // edge, so the pawn pulls up and is stopped by the thing barring its way.
    // The final arch spans its own tile instead.
    //
    // It sits in the gap between this disc and the next, and that gap is the
    // whole budget. It used to be reasoned from `spacing` — the curve's
    // AVERAGE arc length — but the real chord runs 0.84–0.94 of it, leaving
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
    anchor.y += TILE_TOP_LIFT
    quaternion.setFromAxisAngle(up, Math.atan2(tangent.x, tangent.z))
    matrix.compose(anchor, quaternion, new Vector3(fit, fit, fit))

    bakeParts(parts, matrix, outlineWidth, colorBuckets, outlines)
  }

  return bucketsToMeshes(colorBuckets, outlines)
}

/** Transform a recipe's parts into world space and file them into the shared
 *  color buckets (plus the one ink outline pile) for merged drawing. */
const bakeParts = (
  parts: MarkerPart[],
  matrix: Matrix4,
  outlineWidth: number,
  colorBuckets: Map<string, BufferGeometry[]>,
  outlines: BufferGeometry[]
) => {
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

/** Merge the baked buckets: one mesh per color plus one ink outline mesh. */
const bucketsToMeshes = (
  colorBuckets: Map<string, BufferGeometry[]>,
  outlines: BufferGeometry[]
): Mesh[] => {
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
 * The summit cairn: stacked faceted stones and an orange pennant on the
 * finale massif's plateau — the victory stand the gauntlet climb tops out
 * at. Modest against the peak on purpose: the MOUNTAIN is the monument.
 */
const buildSummitCairn = (site: SummitSite, spacing: number): Mesh[] => {
  // Trimmed and stepped back from the plateau center so the victory pawn
  // (which stands toward the face) never touches the stones.
  const s = spacing * 0.45
  const parts: MarkerPart[] = []

  let stackY = 0
  for (const [radius, height] of [
    [0.42, 0.3],
    [0.3, 0.26],
    [0.18, 0.22],
  ]) {
    const drum = new CylinderGeometry(radius * 0.72 * s, radius * s, height * s, 7)
    drum.translate(0, (stackY + height / 2) * s, 0)
    parts.push({ geometry: faceted(drum), color: BOARD_COLORS.warmSand })
    stackY += height
  }

  const pole = new CylinderGeometry(0.035 * s, 0.035 * s, 1.1 * s, 8)
  pole.translate(0, (stackY + 0.55) * s, 0)
  parts.push({ geometry: pole, color: BOARD_COLORS.darkBlue })
  const pennant = new BoxGeometry(0.46 * s, 0.2 * s, 0.04 * s)
  pennant.translate(0.26 * s, (stackY + 0.94) * s, 0)
  parts.push({ geometry: pennant, color: BOARD_COLORS.hiorAnge })

  const colorBuckets = new Map<string, BufferGeometry[]>()
  const outlines: BufferGeometry[] = []
  const matrix = new Matrix4().setPosition(
    site.center.x - Math.sin(site.faceAngle) * 1.2,
    site.center.y,
    site.center.z - Math.cos(site.faceAngle) * 1.2
  )
  bakeParts(parts, matrix, spacing * OUTLINE_WIDTH_RATIO, colorBuckets, outlines)
  return bucketsToMeshes(colorBuckets, outlines)
}

/**
 * One stage tile per gauntlet rung, seated on its bench: an ink-rimmed disc
 * in the track tiles' own language — the bench cut makes each one read as a
 * natural plateau up the wrap (Isaac's pick over the bracket-shelf try; the
 * shelves never stopped reading as paper on the flank).
 */
const buildClimbPlatforms = (site: SummitSite, spacing: number): Mesh[] => {
  const colorBuckets = new Map<string, BufferGeometry[]>()
  const outlines: BufferGeometry[] = []
  const matrix = new Matrix4()

  for (const anchor of site.climbAnchors.slice(0, -1)) {
    matrix.setPosition(anchor.x, anchor.y, anchor.z)
    const parts: MarkerPart[] = []
    // A tall pedestal: the top face stays AT the anchor (the pawn's stand),
    // the shaft runs down through the deepened bench floor with margin.
    const rim = new CylinderGeometry(0.3 * spacing, 0.3 * spacing, 1.2, 24)
    rim.translate(0, -0.63, 0)
    parts.push({ geometry: rim, color: BOARD_COLORS.ink })
    const top = new CylinderGeometry(0.27 * spacing, 0.27 * spacing, 1.2, 24)
    top.translate(0, -0.6, 0)
    parts.push({ geometry: top, color: BOARD_COLORS.warmSand, outline: false })
    bakeParts(parts, matrix, spacing * OUTLINE_WIDTH_RATIO, colorBuckets, outlines)
  }
  return bucketsToMeshes(colorBuckets, outlines)
}

/**
 * The river's living water: a ribbon with per-vertex ANALYTIC depth (water
 * line minus the carved bed under each vertex) rendered by the shared water
 * shader — foam edges, two-tone depth — plus a cascade sheet and boiling
 * plunge pool wherever the downhill clamp took a big step.
 */
const buildRiverMeshes = (
  river: RiverPath,
  biome: BoardBiome,
  sampler: (x: number, z: number) => number,
  timeUniforms: { value: number }[]
): Mesh[] => {
  const meshes: Mesh[] = []
  const water = createWaterMaterial(biome, timeUniforms)

  // Six columns across the fine spline — smooth foam shorelines, not the
  // fractal facets the coarse four-column ribbon triangulated.
  const ACROSS = [-1, -0.6, -0.25, 0.25, 0.6, 1]
  const ribbon = new BufferGeometry()
  const vertices: number[] = []
  const depths: number[] = []
  const indices: number[] = []
  for (let index = 0; index < river.points.length; index++) {
    const point = river.points[index]
    const next = river.points[Math.min(index + 1, river.points.length - 1)]
    const previous = river.points[Math.max(index - 1, 0)]
    const tangent = new Vector3().subVectors(next, previous).setY(0).normalize()
    const side = new Vector3(-tangent.z, 0, tangent.x)
    for (const offset of ACROSS) {
      const x = point.x + side.x * offset * river.width * 0.75
      const z = point.z + side.z * offset * river.width * 0.75
      vertices.push(x, point.y, z)
      depths.push(point.y - sampler(x, z))
    }
  }
  for (let segment = 0; segment < river.points.length - 1; segment++) {
    const row = segment * ACROSS.length
    for (let quad = 0; quad < ACROSS.length - 1; quad++) {
      const a = row + quad
      indices.push(a, a + ACROSS.length, a + 1, a + 1, a + ACROSS.length, a + ACROSS.length + 1)
    }
  }
  ribbon.setIndex(indices)
  ribbon.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
  ribbon.setAttribute('aDepth', new BufferAttribute(new Float32Array(depths), 1))
  meshes.push(new Mesh(ribbon, water))

  const fallVertices: number[] = []
  const fallDepths: number[] = []
  const fallIndices: number[] = []
  for (const { top, bottom } of river.falls) {
    const tangent = new Vector3().subVectors(bottom, top).setY(0).normalize()
    const side = new Vector3(-tangent.z, 0, tangent.x)
    const lip = new Vector3().addVectors(top, tangent.clone().multiplyScalar(1.1))
    const row = fallVertices.length / 3
    for (const y of [top.y + 0.06, bottom.y - 0.15]) {
      for (const offset of [-1, 1]) {
        fallVertices.push(lip.x + side.x * offset * 1.15, y, lip.z + side.z * offset * 1.15)
        fallDepths.push(0.12)
      }
    }
    fallIndices.push(row, row + 2, row + 1, row + 1, row + 2, row + 3)

    const pool = new Vector3().addVectors(bottom, tangent.clone().multiplyScalar(0.6))
    const poolRow = fallVertices.length / 3
    const POOL_SPOKES = 10
    fallVertices.push(pool.x, bottom.y + 0.05, pool.z)
    fallDepths.push(0.08)
    for (let spoke = 0; spoke <= POOL_SPOKES; spoke++) {
      const angle = (spoke / POOL_SPOKES) * Math.PI * 2
      fallVertices.push(
        pool.x + Math.cos(angle) * 1.7,
        bottom.y + 0.05,
        pool.z + Math.sin(angle) * 1.7
      )
      fallDepths.push(0.22)
      if (spoke > 0) fallIndices.push(poolRow, poolRow + spoke, poolRow + spoke + 1)
    }
  }
  if (fallIndices.length) {
    const falls = new BufferGeometry()
    falls.setIndex(fallIndices)
    falls.setAttribute('position', new BufferAttribute(new Float32Array(fallVertices), 3))
    falls.setAttribute('aDepth', new BufferAttribute(new Float32Array(fallDepths), 1))
    meshes.push(new Mesh(falls, water))
  }

  // The terminal pool: rivers end where the water stops dropping, and the
  // mouth spreads into a foam-edged pool — a depth grid like the pond's,
  // whose shoreline emerges wherever depth crosses zero.
  const mouth = river.points[river.points.length - 1]
  const POOL_REACH = river.width * 2.2
  const pool = new PlaneGeometry(POOL_REACH * 2, POOL_REACH * 2, 18, 18)
  pool.rotateX(-Math.PI / 2)
  pool.translate(mouth.x, mouth.y, mouth.z)
  const poolPositions = pool.attributes.position
  const poolDepths = new Float32Array(poolPositions.count)
  for (let index = 0; index < poolPositions.count; index++) {
    const px = poolPositions.getX(index)
    const pz = poolPositions.getZ(index)
    // The pool basin: a shallow scoop blended off the mouth, carved into the
    // DEPTH FIELD only (visual water over the existing ground carve). The
    // whole term fades with the scoop: a mouth that ends mid-slope (fold
    // guard, bank slides) must never flood the plane's square corner over
    // lower ground downhill — that rendered as a giant straight-edged sheet.
    const reach = Math.hypot(px - mouth.x, pz - mouth.z)
    const scoop = Math.max(0, 1 - reach / POOL_REACH)
    poolDepths[index] = (Math.max(mouth.y - sampler(px, pz), 0) + 0.12) * scoop - 0.02
  }
  pool.setAttribute('aDepth', new BufferAttribute(poolDepths, 1))
  meshes.push(new Mesh(pool, water))

  return meshes
}

/** A survey cairn on an off-track hilltop: two stacked stones and a slim
 *  trig-point pole — the land reads as charted. */
const buildHillCairn = (site: Vector3, spacing: number): Mesh[] => {
  const s = spacing * 0.34
  const parts: MarkerPart[] = []

  let stackY = 0
  for (const [radius, height] of [
    [0.44, 0.3],
    [0.28, 0.24],
  ]) {
    const drum = new CylinderGeometry(radius * 0.72 * s, radius * s, height * s, 7)
    drum.translate(0, (stackY + height / 2) * s, 0)
    parts.push({ geometry: faceted(drum), color: BOARD_COLORS.warmSand })
    stackY += height
  }
  // A ball-finial pole, deliberately NOT a cross-arm: pole-plus-crossbar on
  // a mound read as a roadside crucifix from board distance (Isaac spotted
  // it immediately). The ball keeps the survey-marker story.
  const pole = new CylinderGeometry(0.03 * s, 0.03 * s, 0.78 * s, 8)
  pole.translate(0, (stackY + 0.39) * s, 0)
  parts.push({ geometry: pole, color: BOARD_COLORS.darkBlue })
  const finial = new SphereGeometry(0.085 * s, 10, 8)
  finial.translate(0, (stackY + 0.82) * s, 0)
  parts.push({ geometry: faceted(finial), color: BOARD_COLORS.darkBlue })

  const colorBuckets = new Map<string, BufferGeometry[]>()
  const outlines: BufferGeometry[] = []
  const matrix = new Matrix4().setPosition(site.x, site.y, site.z)
  bakeParts(parts, matrix, spacing * OUTLINE_WIDTH_RATIO, colorBuckets, outlines)
  return bucketsToMeshes(colorBuckets, outlines)
}

/** A compass-rose ink decal DRAPED onto the ground — every vertex sits on
 *  the sampled terrain plus a small lift, and the blades are segmented so no
 *  triangle bridges a rise (a flat decal on only-mostly-flat ground clipped
 *  into every swell it crossed). North points at the default seat's top. */
const buildCompassRose = (site: Vector3, spacing: number, sampler: HeightSampler): Mesh => {
  const s = spacing * 0.62
  const geometries: BufferGeometry[] = []

  geometries.push(new RingGeometry(0.82 * s, 0.9 * s, 64))
  geometries.push(new RingGeometry(0.36 * s, 0.4 * s, 48))

  // Segmented blades: a tapering strip of quads per point, so the drape can
  // follow the ground along the blade's whole length.
  for (let index = 0; index < 8; index++) {
    const cardinal = index % 2 === 0
    const length = (cardinal ? 0.8 : 0.52) * s
    const width = (cardinal ? 0.11 : 0.07) * s
    const SEGMENTS = 5
    const vertices: number[] = []
    const indices: number[] = []
    for (let step = 0; step <= SEGMENTS; step++) {
      const t = step / SEGMENTS
      const y = 0.12 * s + (length - 0.12 * s) * t
      const w = width * (1 - t)
      vertices.push(-w, y, 0, w, y, 0)
      if (step > 0) {
        const row = (step - 1) * 2
        indices.push(row, row + 1, row + 2, row + 1, row + 3, row + 2)
      }
    }
    const blade = new BufferGeometry()
    blade.setIndex(indices)
    blade.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
    blade.rotateZ((index * Math.PI) / 4)
    geometries.push(blade)
  }

  // Position-only across the board: the rings carry uv/normal attributes the
  // hand-built blades don't, and mergeGeometries refuses mixed layouts.
  const merged = mergeGeometries(
    geometries.map(geometry => {
      const uniform = geometry.toNonIndexed()
      uniform.deleteAttribute('uv')
      uniform.deleteAttribute('normal')
      return uniform
    })
  )
  geometries.forEach(geometry => geometry.dispose())
  merged.rotateX(-Math.PI / 2)
  merged.translate(site.x, 0, site.z)
  const positions = merged.attributes.position
  for (let index = 0; index < positions.count; index++) {
    positions.setY(index, sampler(positions.getX(index), positions.getZ(index)) + 0.16)
  }
  positions.needsUpdate = true
  return new Mesh(
    merged,
    new MeshBasicMaterial({
      color: BOARD_COLORS.darkBlue,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    })
  )
}

/** A ring of standing stones on its saddle: rough-hewn tapered monoliths,
 *  uprights only — no lintels (a crossbar silhouette is banned board-wide).
 *  Survey furniture like the cairns, so biome-blind cream-and-ink. */
const buildStandingStones = (
  stones: NonNullable<ScenerySites['stones']>,
  spacing: number,
  sampler: HeightSampler
): Mesh[] => {
  const { center, yaw, count } = stones
  const parts: MarkerPart[] = []
  const ringRadius = spacing * 0.55
  for (let index = 0; index < count; index++) {
    // Deterministic per-stone character without touching any RNG stream.
    const wobble = Math.sin(index * 12.9898 + yaw * 78.233)
    const angle = yaw + (index * Math.PI * 2) / count + wobble * 0.22
    const x = Math.sin(angle) * ringRadius
    const z = Math.cos(angle) * ringRadius
    const height = spacing * (0.3 + Math.abs(Math.sin(index * 4.7 + yaw)) * 0.12)
    const monolith = new CylinderGeometry(
      spacing * (0.055 + Math.abs(wobble) * 0.012),
      spacing * (0.085 + Math.abs(wobble) * 0.015),
      height,
      4
    )
    monolith.rotateZ(wobble * 0.08)
    monolith.rotateY(angle + wobble)
    // Each stone stands on ITS ground — the saddle is only mostly flat.
    const ground = sampler(center.x + x, center.z + z)
    monolith.translate(x, ground - center.y - 0.08 + height / 2, z)
    parts.push({ geometry: faceted(monolith), color: BOARD_COLORS.warmSand })
  }

  const colorBuckets = new Map<string, BufferGeometry[]>()
  const outlines: BufferGeometry[] = []
  const matrix = new Matrix4().setPosition(center.x, center.y, center.z)
  bakeParts(parts, matrix, spacing * OUTLINE_WIDTH_RATIO, colorBuckets, outlines)
  return bucketsToMeshes(colorBuckets, outlines)
}

/** A fingerpost: one darkBlue post, ONE pointed warmSand board angled along
 *  the route — never a second arm (crossbar silhouettes are banned). */
const buildWaymark = (site: WaymarkSite, spacing: number): Mesh[] => {
  const s = spacing
  const parts: MarkerPart[] = []

  const post = new CylinderGeometry(0.022 * s, 0.028 * s, 0.5 * s, 8)
  post.translate(0, 0.25 * s, 0)
  parts.push({ geometry: post, color: BOARD_COLORS.darkBlue })

  // The pointing board: a slat running +z (the arm's heading) with a chisel
  // tip — built at the post top, nudged forward so it reads side-mounted.
  const slat = new BoxGeometry(0.03 * s, 0.085 * s, 0.3 * s)
  slat.translate(0, 0.44 * s, 0.17 * s)
  parts.push({ geometry: slat, color: BOARD_COLORS.warmSand })
  const tip = new CylinderGeometry(0.0425 * s, 0.0425 * s, 0.03 * s, 4)
  tip.rotateZ(Math.PI / 2)
  tip.rotateX(Math.PI / 4)
  tip.translate(0, 0.44 * s, 0.345 * s)
  parts.push({ geometry: faceted(tip), color: BOARD_COLORS.warmSand })

  const colorBuckets = new Map<string, BufferGeometry[]>()
  const outlines: BufferGeometry[] = []
  const matrix = new Matrix4()
    .makeRotationY(site.yaw)
    .setPosition(site.position.x, site.position.y - 0.04, site.position.z)
  bakeParts(parts, matrix, spacing * OUTLINE_WIDTH_RATIO, colorBuckets, outlines)
  return bucketsToMeshes(colorBuckets, outlines)
}

/** The printed scale bar: alternating filled segments inside a hairline
 *  frame with quarter ticks — a draped ink decal like the compass rose,
 *  yawed to a seeded cardinal. The purest "this is a living map" statement
 *  on the board. */
const buildScaleBar = (
  scaleBar: NonNullable<ScenerySites['scaleBar']>,
  sampler: HeightSampler
): Mesh => {
  const { center, yaw } = scaleBar
  const LENGTH = 4.2
  const HALF_WIDTH = 0.14
  const RAIL = 0.035
  const geometries: BufferGeometry[] = []

  // A draped quad strip along +Y (the compass-blade recipe): segmented so
  // the decal follows the ground.
  const strip = (
    fromY: number,
    toY: number,
    halfWidth: number,
    offsetX = 0,
    steps = 4
  ): BufferGeometry => {
    const vertices: number[] = []
    const indices: number[] = []
    for (let step = 0; step <= steps; step++) {
      const y = fromY + ((toY - fromY) * step) / steps
      vertices.push(offsetX - halfWidth, y, 0, offsetX + halfWidth, y, 0)
      if (step > 0) {
        const row = (step - 1) * 2
        indices.push(row, row + 1, row + 2, row + 1, row + 3, row + 2)
      }
    }
    const geometry = new BufferGeometry()
    geometry.setIndex(indices)
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
    return geometry
  }

  const half = LENGTH / 2
  // Filled first and third quarters — the classic alternating bar.
  geometries.push(strip(-half, -half / 2, HALF_WIDTH))
  geometries.push(strip(0, half / 2, HALF_WIDTH))
  // The hairline frame: two side rails and the two end caps.
  geometries.push(strip(-half, half, RAIL / 2, -HALF_WIDTH - RAIL / 2, 8))
  geometries.push(strip(-half, half, RAIL / 2, HALF_WIDTH + RAIL / 2, 8))
  geometries.push(strip(-half - RAIL, -half, HALF_WIDTH + RAIL, 0, 1))
  geometries.push(strip(half, half + RAIL, HALF_WIDTH + RAIL, 0, 1))
  // Quarter ticks reaching past the frame.
  for (const at of [-half, -half / 2, 0, half / 2, half]) {
    geometries.push(strip(at - RAIL / 2, at + RAIL / 2, HALF_WIDTH + 0.14, 0, 1))
  }

  const merged = mergeGeometries(
    geometries.map(geometry => geometry.toNonIndexed())
  )
  geometries.forEach(geometry => geometry.dispose())
  merged.rotateZ(yaw)
  merged.rotateX(-Math.PI / 2)
  merged.translate(center.x, 0, center.z)
  const positions = merged.attributes.position
  for (let index = 0; index < positions.count; index++) {
    positions.setY(index, sampler(positions.getX(index), positions.getZ(index)) + 0.16)
  }
  positions.needsUpdate = true
  return new Mesh(
    merged,
    new MeshBasicMaterial({
      color: BOARD_COLORS.darkBlue,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
  )
}

/** The surveyor's basecamp: an A-frame ridge tent of two leaning canvas
 *  slabs (open silhouette, no cross-arms) and an ink pennant pole riding the
 *  flora wind clock — the cairns-and-compass surveying story, completed. */
const buildBasecamp = (
  basecamp: NonNullable<ScenerySites['basecamp']>,
  spacing: number,
  timeUniforms: { value: number }[]
): (Mesh | InstancedMesh)[] => {
  const { center, yaw } = basecamp
  const parts: MarkerPart[] = []

  const LEAN = 0.62
  for (const side of [-1, 1]) {
    const slab = new BoxGeometry(1.05, 0.05, 0.72)
    slab.rotateX(side * LEAN)
    slab.translate(0, 0.42, side * 0.26)
    parts.push({ geometry: slab, color: BOARD_COLORS.warmSand })
  }
  const pole = new CylinderGeometry(0.025, 0.03, 0.95, 8)
  pole.translate(0.85, 0.475, 0)
  parts.push({ geometry: pole, color: BOARD_COLORS.darkBlue })

  const colorBuckets = new Map<string, BufferGeometry[]>()
  const outlines: BufferGeometry[] = []
  const matrix = new Matrix4()
    .makeRotationY(yaw)
    .setPosition(center.x, center.y - 0.04, center.z)
  bakeParts(parts, matrix, spacing * OUTLINE_WIDTH_RATIO, colorBuckets, outlines)
  const meshes: (Mesh | InstancedMesh)[] = bucketsToMeshes(colorBuckets, outlines)

  // The pennant: a two-triangle flag on the wind clock (count-1 instancing —
  // the wind shader reads instanceMatrix).
  const flag = new BufferGeometry()
  // prettier-ignore
  const flagVertices = new Float32Array([
    0, 0.95, 0,   0, 0.78, 0,   0.34, 0.86, 0,
  ])
  flag.setAttribute('position', new BufferAttribute(flagVertices, 3))
  flag.setAttribute('aPhase', new InstancedBufferAttribute(new Float32Array([0.7]), 1))
  const pennant = new InstancedMesh(
    flag,
    windMaterial(BOARD_COLORS.hiorAnge, prefersReducedMotion() ? 0 : 0.05, timeUniforms),
    1
  )
  const pennantMatrix = new Matrix4()
    .makeRotationY(yaw)
    .setPosition(center.x + Math.cos(yaw) * 0.85, center.y - 0.04, center.z - Math.sin(yaw) * 0.85)
  pennant.setMatrixAt(0, pennantMatrix)
  meshes.push(pennant)
  return meshes
}

/** The moored rowboat: lapped hull strakes, pointed prow and stern, two
 *  thwarts — cream and ink like the bridge it often neighbours. Returned as
 *  a Group so the mooring bob can ride it whole. */
const buildRowboat = (
  mooring: BoatMooring,
  spacing: number
): { group: Group; animate: (time: number) => void } => {
  const parts: MarkerPart[] = []
  for (const [width, lift, breadth] of [
    [0.86, 0.05, 0.3],
    [1.0, 0.12, 0.38],
    [1.14, 0.19, 0.46],
  ]) {
    const strake = new BoxGeometry(width, 0.075, breadth)
    strake.translate(0, lift, 0)
    parts.push({ geometry: strake, color: BOARD_COLORS.warmSand })
  }
  for (const end of [-1, 1]) {
    const prow = new CylinderGeometry(0.001, 0.23, 0.34, 4)
    prow.rotateZ(end * (Math.PI / 2))
    prow.translate(end * 0.72, 0.12, 0)
    parts.push({ geometry: faceted(prow), color: BOARD_COLORS.warmSand })
  }
  for (const at of [-0.22, 0.24]) {
    const thwart = new BoxGeometry(0.08, 0.035, 0.42)
    thwart.translate(at, 0.21, 0)
    parts.push({ geometry: thwart, color: BOARD_COLORS.darkBlue })
  }

  const colorBuckets = new Map<string, BufferGeometry[]>()
  const outlines: BufferGeometry[] = []
  bakeParts(parts, new Matrix4(), spacing * OUTLINE_WIDTH_RATIO, colorBuckets, outlines)
  const group = new Group()
  bucketsToMeshes(colorBuckets, outlines).forEach(mesh => group.add(mesh))
  group.rotation.y = mooring.yaw
  group.position.copy(mooring.position)
  group.position.y = mooring.position.y - 0.02

  const animate = (time: number) => {
    if (prefersReducedMotion()) return
    group.position.y = mooring.position.y - 0.02 + Math.sin(time * 0.9) * 0.02
    group.rotation.z = Math.sin(time * 0.7 + 1.3) * 0.02
    group.rotation.x = Math.sin(time * 0.55) * 0.015
  }
  return { group, animate }
}

/** What the hamlet wears per biome — scenery reads the palette the way the
 *  train does; game pieces still never do. */
const TOWN_WALLS: Record<BoardBiome['name'], keyof BoardBiome> = {
  parchment: 'foam',
  grassland: 'trunkColor',
  desert: 'rock',
  ice: 'foam',
}
const TOWN_ROOFS: Record<BoardBiome['name'], keyof BoardBiome> = {
  parchment: 'major',
  grassland: 'foliageColor',
  desert: 'crest',
  ice: 'major',
}

/**
 * The hamlet made flesh: gabled houses (box + squashed 45°-yawed pyramid),
 * train-red door ticks, a ball-finial tower — never a windmill, whose sails
 * are cross-arms — and a lane decal draped through the huddle. One chimney
 * smokes on the railway's puff idiom; reduced motion shows a quiet town.
 */
const buildTownMeshes = (
  town: TownSite,
  biome: BoardBiome,
  spacing: number,
  sampler: HeightSampler
): { meshes: (Mesh | Group)[]; animate?: (time: number) => void } => {
  const walls = biome[TOWN_WALLS[biome.name]] as string
  const roofs = biome[TOWN_ROOFS[biome.name]] as string
  const accent = '#ec6247'

  const colorBuckets = new Map<string, BufferGeometry[]>()
  const outlines: BufferGeometry[] = []
  let chimneys = 0
  let smokeStack: Vector3 | undefined

  town.houses.forEach((house, index) => {
    const parts: MarkerPart[] = []
    if (house.kind === 'tower') {
      const shaft = new BoxGeometry(0.62, 1.5, 0.62)
      shaft.translate(0, 0.75, 0)
      parts.push({ geometry: shaft, color: walls })
      const cap = new ConeGeometry(0.52, 0.5, 4)
      cap.rotateY(Math.PI / 4)
      cap.translate(0, 1.75, 0)
      parts.push({ geometry: faceted(cap), color: roofs })
      const finial = new SphereGeometry(0.09, 10, 8)
      finial.translate(0, 2.08, 0)
      parts.push({ geometry: faceted(finial), color: BOARD_COLORS.darkBlue })
      const door = new BoxGeometry(0.2, 0.36, 0.05)
      door.translate(0, 0.18, 0.31)
      parts.push({ geometry: door, color: accent })
    } else {
      const body = new BoxGeometry(1.15, 0.6, 0.9)
      body.translate(0, 0.3, 0)
      parts.push({ geometry: body, color: walls })
      const roof = new ConeGeometry(0.85, 0.55, 4)
      roof.rotateY(Math.PI / 4)
      roof.scale(1, 1, 0.78)
      roof.translate(0, 0.87, 0)
      parts.push({ geometry: faceted(roof), color: roofs })
      const door = new BoxGeometry(0.2, 0.34, 0.05)
      door.translate(0, 0.17, 0.44)
      parts.push({ geometry: door, color: accent })
      if (chimneys < 3 && index % 2 === 0) {
        chimneys++
        const chimney = new BoxGeometry(0.15, 0.42, 0.15)
        chimney.translate(0.32, 0.95, 0.12)
        parts.push({ geometry: chimney, color: BOARD_COLORS.darkBlue })
        if (!smokeStack) {
          // World-space stack top for the puffs, matching the house's bake.
          const local = new Vector3(0.32, 1.18, 0.12).multiplyScalar(house.scale)
          local.applyAxisAngle(new Vector3(0, 1, 0), house.yaw)
          smokeStack = new Vector3(house.x, house.y - 0.05, house.z).add(local)
        }
      }
    }
    const matrix = new Matrix4()
      .makeRotationY(house.yaw)
      .scale(new Vector3(house.scale, house.scale, house.scale))
      .setPosition(house.x, house.y - 0.05, house.z)
    bakeParts(parts, matrix, spacing * OUTLINE_WIDTH_RATIO, colorBuckets, outlines)
  })

  const meshes: (Mesh | Group)[] = bucketsToMeshes(colorBuckets, outlines)

  // The lane: a draped ribbon decal in the biome's minor ink, segment by
  // segment so it follows the ground (the compass-rose recipe).
  const laneQuads: BufferGeometry[] = []
  const LANE_HALF = 0.28
  for (let index = 0; index < town.lane.length - 1; index++) {
    const here = town.lane[index]
    const next = town.lane[index + 1]
    const direction = Math.atan2(next.x - here.x, next.z - here.z)
    const acrossX = Math.cos(direction) * LANE_HALF
    const acrossZ = -Math.sin(direction) * LANE_HALF
    const quad = new BufferGeometry()
    // prettier-ignore
    const vertices = new Float32Array([
      here.x - acrossX, 0, here.z - acrossZ,
      here.x + acrossX, 0, here.z + acrossZ,
      next.x - acrossX, 0, next.z - acrossZ,
      here.x + acrossX, 0, here.z + acrossZ,
      next.x + acrossX, 0, next.z + acrossZ,
      next.x - acrossX, 0, next.z - acrossZ,
    ])
    quad.setAttribute('position', new BufferAttribute(vertices, 3))
    laneQuads.push(quad)
  }
  const lane = mergeGeometries(laneQuads)
  laneQuads.forEach(quad => quad.dispose())
  const lanePositions = lane.attributes.position
  for (let index = 0; index < lanePositions.count; index++) {
    lanePositions.setY(
      index,
      sampler(lanePositions.getX(index), lanePositions.getZ(index)) + 0.14
    )
  }
  lanePositions.needsUpdate = true
  meshes.push(
    new Mesh(
      lane,
      new MeshBasicMaterial({
        color: biome.minor,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      })
    )
  )

  // One hearth: puffs cycling off the first chimney, exactly the train's
  // smoke — a still scene keeps them parked at the stack.
  let animate: ((time: number) => void) | undefined
  if (smokeStack) {
    const stack = smokeStack
    const puffs: Mesh[] = []
    for (let index = 0; index < 3; index++) {
      const puff = new Mesh(
        new SphereGeometry(0.14, 8, 6),
        new MeshBasicMaterial({ color: '#9aa4ae', transparent: true, opacity: 0.7 })
      )
      puff.position.copy(stack)
      puffs.push(puff)
      meshes.push(puff)
    }
    animate = (time: number) => {
      if (prefersReducedMotion()) return
      puffs.forEach((puff, index) => {
        const cycle = (time * 0.32 + index / puffs.length) % 1
        puff.position.set(stack.x + cycle * 0.5, stack.y + cycle * 1.5, stack.z)
        const swell = 0.6 + cycle * 1.4
        puff.scale.set(swell, swell, swell)
        ;(puff.material as MeshBasicMaterial).opacity = 0.7 * (1 - cycle * cycle)
      })
    }
  }

  return { meshes, animate }
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
