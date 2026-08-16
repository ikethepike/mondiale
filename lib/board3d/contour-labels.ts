import {
  type BufferGeometry,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { BoardBiome } from './biomes'
import { type LakeSite, lakeShoreDistance } from './lake'
import type { TilePathResult } from './path'
import type { PondSite } from './water'
import type { RiverPath } from './river'
import type { SummitSite } from './summit'
import { EDGE_FADE_START, type HeightSampler, MAX_ELEVATION } from './terrain'

/**
 * Elevation labels riding the major contour lines, ported from /test-terrain:
 * numbers lying flat ALONG their line with a page-colored halo, so each label
 * visibly breaks the ink — the topo-map convention. Two phases like every
 * decoration: `pickContourLabels` is pure siting math (testable), the canvas
 * atlas and merged quads happen in `buildContourLabels`.
 */

/** Matches the shader: uStep = MAX_ELEVATION / 8, majors every 5th line. */
export const MAJOR_CONTOUR_STEP = (MAX_ELEVATION / 8) * 5

/** A label site must sit ON its level, on a slope where lines actually draw
 *  (the shader's flatness window), and keep its distance from neighbours. */
const LEVEL_TOLERANCE = 0.1
const GRADIENT_MIN = 0.05
const GRADIENT_MAX = 0.5
const LABEL_SEPARATION = 24
const LABEL_CAP = 14
const SCAN_STEP = 5
const SCAN_REACH = 78

export interface ContourLabelSite {
  x: number
  z: number
  y: number
  levelIndex: number
  yaw: number
}

export interface ContourLabelPlan {
  levels: number[]
  sites: ContourLabelSite[]
}

export interface ContourLabelOptions {
  pond?: PondSite
  summit?: SummitSite
  river?: RiverPath
  railway?: Vector3[]
  lake?: LakeSite
  /** Lines fade into the snow wash — no label stands on snow. */
  snowlineY?: number
}

/**
 * Deterministic grid sweep (no RNG stream — the terrain itself decides):
 * every major level below the snowline collects flat-enough spots on its
 * line, clear of track, water, rails and the page fade.
 */
export const pickContourLabels = (
  sampler: HeightSampler,
  path: TilePathResult,
  options: ContourLabelOptions = {}
): ContourLabelPlan => {
  const { pond, summit, river, railway, lake, snowlineY } = options
  const { shelfPoints, spacing } = path
  const clearance = spacing * 0.95
  const clearanceSquared = clearance * clearance

  const levels: number[] = []
  for (let level = MAJOR_CONTOUR_STEP; level < MAX_ELEVATION * 2; level += MAJOR_CONTOUR_STEP) {
    if (snowlineY !== undefined && level >= snowlineY) break
    levels.push(level)
  }

  const sites: ContourLabelSite[] = []
  const isClear = (x: number, z: number): boolean => {
    if (Math.hypot(x, z) > EDGE_FADE_START - 4) return false
    for (const point of shelfPoints) {
      const dx = point.x - x
      const dz = point.z - z
      if (dx * dx + dz * dz < clearanceSquared) return false
    }
    if (pond && Math.hypot(pond.center.x - x, pond.center.z - z) < pond.basinRadius + 1)
      return false
    if (summit && Math.hypot(summit.center.x - x, summit.center.z - z) < summit.radius + 1)
      return false
    if (river) {
      for (const point of river.points) {
        if (Math.hypot(point.x - x, point.z - z) < river.width + 1.5) return false
      }
    }
    if (railway) {
      for (const point of railway) {
        if (Math.hypot(point.x - x, point.z - z) < 2.6) return false
      }
    }
    if (lake && lakeShoreDistance(lake, x, z) < 1.5) return false
    return true
  }

  for (let x = -SCAN_REACH; x <= SCAN_REACH && sites.length < LABEL_CAP; x += SCAN_STEP) {
    for (let z = -SCAN_REACH; z <= SCAN_REACH && sites.length < LABEL_CAP; z += SCAN_STEP) {
      const y = sampler(x, z)
      const levelIndex = levels.findIndex(level => Math.abs(y - level) < LEVEL_TOLERANCE)
      if (levelIndex < 0) continue
      const gradientX = (sampler(x + 1, z) - sampler(x - 1, z)) / 2
      const gradientZ = (sampler(x, z + 1) - sampler(x, z - 1)) / 2
      const gradient = Math.hypot(gradientX, gradientZ)
      if (gradient < GRADIENT_MIN || gradient > GRADIENT_MAX) continue
      if (!isClear(x, z)) continue
      if (sites.some(site => Math.hypot(site.x - x, site.z - z) < LABEL_SEPARATION)) continue

      // Lie along the contour (perpendicular to the gradient); flip so the
      // number never reads upside down from the default south camera.
      let yaw = Math.atan2(-gradientZ, gradientX)
      if (Math.cos(yaw) < 0) yaw += Math.PI
      sites.push({ x, z, y, levelIndex, yaw })
    }
  }

  return { levels, sites }
}

/**
 * The atlas and quads: one canvas of level numbers, one merged mesh of
 * UV-remapped quads draped at their sites. Static — no clock.
 */
export const buildContourLabels = (
  plan: ContourLabelPlan,
  biome: BoardBiome
): Mesh | undefined => {
  const { levels, sites } = plan
  if (!sites.length || typeof document === 'undefined') return undefined

  const canvas = document.createElement('canvas')
  const CELL = 96
  canvas.width = CELL * levels.length
  canvas.height = CELL
  const context = canvas.getContext('2d')
  if (!context) return undefined
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = 'bold 44px Georgia, serif'
  levels.forEach((level, index) => {
    // The survey fiction: world units read as hundreds of metres, rounded to
    // the printed tens.
    const text = `${Math.round((level * 100) / 10) * 10}`
    // The halo is the page color, so the label visually BREAKS the line.
    context.lineWidth = 12
    context.strokeStyle = '#fffaf5'
    context.strokeText(text, CELL * index + CELL / 2, CELL / 2)
    context.fillStyle = biome.major
    context.fillText(text, CELL * index + CELL / 2, CELL / 2)
  })
  const texture = new CanvasTexture(canvas)

  const quads: BufferGeometry[] = []
  for (const site of sites) {
    const quad = new PlaneGeometry(3.4, 1.7)
    const uv = quad.attributes.uv
    for (let corner = 0; corner < uv.count; corner++) {
      uv.setX(corner, (site.levelIndex + uv.getX(corner)) / levels.length)
    }
    quad.rotateX(-Math.PI / 2)
    quad.rotateY(site.yaw)
    quad.translate(site.x, site.y + 0.14, site.z)
    quads.push(quad)
  }
  const labels = new Mesh(
    mergeGeometries(quads),
    new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  )
  quads.forEach(quad => quad.dispose())
  return labels
}
