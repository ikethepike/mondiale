import Alea from 'alea'
import { Vector3 } from 'three'
import type { HeightSampler } from './terrain'
import { EDGE_FADE_START, MAX_ELEVATION, smoothstep } from './terrain'
import type { TilePathResult } from './path'
import type { PondSite } from './water'
import type { RiverPath } from './river'
import type { SummitSite } from './summit'

/**
 * A lake DISCOVERED from the terrain, not authored onto it: a seeded probe
 * finds a natural depression, raises a trial water level until one more step
 * would leak past the depression's lowest saddle, and keeps the flooded
 * footprint. The shoreline is the real terrain/water intersection — bays,
 * headlands, even an island where a knoll clears the water — and the water
 * mesh clips itself to it the same way the pond does. `withLakeBed` only
 * DEEPENS ground already underwater (fading to nothing at the shoreline and
 * at the footprint's rim), so the discovered outline never moves.
 */
export interface LakeGrid {
  originX: number
  originZ: number
  step: number
  columns: number
  rows: number
  /** 1 = flooded cell. */
  mask: Uint8Array
  /** 0 at the footprint's rim rising to 1 a few cells in — the bed assist's
   *  fade, so the carve can never step at the mask edge. */
  interior: Float32Array
}

export interface LakeSite {
  waterY: number
  /** Footprint centroid, y = water surface. */
  center: Vector3
  /** Every footprint cell sits within this reach of the centroid. */
  boundingRadius: number
  /** Shoreline cells as world points (y = water surface) — the cheap
   *  distance field for moisture, reeds and clearance checks. */
  shore: Vector3[]
  /** Water depth at the deepest point. */
  depth: number
  grid: LakeGrid
}

/** A dealt lake is a once-in-five-boards event. The fBm ground turns out to
 *  offer holding basins on nearly every probe (measured: siting attrition is
 *  almost nil), so the gate IS the deal rate. */
const LAKE_CHANCE = 0.22
/** Scan pitch (world units) — the flood grid's resolution. */
const GRID_STEP = 2
/** Flooded area bounds (world units²). */
const MIN_AREA = 120
const MAX_AREA = 450
/** The deep point must sit at least this far under the surface — a lake is
 *  a DROWNED basin, not a sheen on a dip (shallow fills read as puddle
 *  spam, Isaac's call on the first live board). */
const MIN_DEPTH = 0.85
/** Trial levels rise in these increments until the basin leaks. */
const LEVEL_STEP = 0.08
const MAX_FILL = 1.7
/** Flooded ground keeps this berth (×spacing) off every track sample. */
const TRACK_CLEARANCE = 1.2

export const pickLakeSite = (
  seed: string,
  path: TilePathResult,
  pond: PondSite | undefined,
  summit: SummitSite | undefined,
  river: RiverPath | undefined,
  sampler: HeightSampler
): LakeSite | undefined => {
  const random = Alea(`${seed}:lake`)
  if (random() >= LAKE_CHANCE) return undefined

  const { shelfPoints, spacing } = path
  const clearance = TRACK_CLEARANCE * spacing
  const clearanceSquared = clearance * clearance

  const reach = EDGE_FADE_START - 8
  const columns = Math.floor((reach * 2) / GRID_STEP) + 1
  const rows = columns
  const originX = -reach
  const originZ = -reach
  const heights = new Float32Array(columns * rows)
  // A cell the water may NEVER occupy: near the track, inside the summit's
  // or the pond's ground, riding the river's carve, or off the page.
  const barred = new Uint8Array(columns * rows)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = originX + column * GRID_STEP
      const z = originZ + row * GRID_STEP
      const index = row * columns + column
      heights[index] = sampler(x, z)
      if (Math.hypot(x, z) > reach) {
        barred[index] = 1
        continue
      }
      for (const point of shelfPoints) {
        const dx = point.x - x
        const dz = point.z - z
        if (dx * dx + dz * dz < clearanceSquared) {
          barred[index] = 1
          break
        }
      }
      if (barred[index]) continue
      if (pond && Math.hypot(pond.center.x - x, pond.center.z - z) < pond.basinRadius + spacing) {
        barred[index] = 1
        continue
      }
      if (
        summit &&
        Math.hypot(summit.center.x - x, summit.center.z - z) < summit.radius + spacing
      ) {
        barred[index] = 1
        continue
      }
      if (river) {
        for (const point of river.points) {
          if (Math.hypot(point.x - x, point.z - z) < river.width + 1.5) {
            barred[index] = 1
            break
          }
        }
      }
    }
  }

  // Candidate basins: unbarred local minima on low ground, lowest first.
  const candidates: number[] = []
  for (let row = 1; row < rows - 1; row++) {
    for (let column = 1; column < columns - 1; column++) {
      const index = row * columns + column
      if (barred[index]) continue
      if (heights[index] > MAX_ELEVATION * 0.55) continue
      const here = heights[index]
      let lowest = true
      for (const [dr, dc] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ]) {
        if (heights[(row + dr) * columns + (column + dc)] <= here) {
          lowest = false
          break
        }
      }
      if (lowest) candidates.push(index)
    }
  }
  candidates.sort((a, b) => heights[a] - heights[b])

  const cellArea = GRID_STEP * GRID_STEP
  const maxCells = Math.floor(MAX_AREA / cellArea)

  for (const start of candidates.slice(0, 12)) {
    const floor = heights[start]

    // Raise the water step by step; each level floods by BFS from the
    // basin's deep point. A flood that touches a barred cell has leaked past
    // the saddle (or into claimed ground) — keep the last level that held.
    let held: { level: number; cells: number[] } | undefined
    for (let level = floor + LEVEL_STEP; level <= floor + MAX_FILL + 1e-9; level += LEVEL_STEP) {
      const seen = new Uint8Array(columns * rows)
      const cells: number[] = []
      const queue = [start]
      seen[start] = 1
      let leaked = false
      while (queue.length && !leaked && cells.length <= maxCells) {
        const index = queue.pop() as number
        if (heights[index] >= level) continue
        if (barred[index]) {
          leaked = true
          break
        }
        cells.push(index)
        const row = Math.floor(index / columns)
        const column = index % columns
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const nr = row + dr
          const nc = column + dc
          if (nr < 0 || nr >= rows || nc < 0 || nc >= columns) {
            leaked = true
            break
          }
          const next = nr * columns + nc
          if (!seen[next]) {
            seen[next] = 1
            queue.push(next)
          }
        }
      }
      if (leaked || cells.length > maxCells) break
      held = { level, cells }
    }

    if (!held) continue
    if (held.cells.length * cellArea < MIN_AREA) continue
    if (held.level - floor < MIN_DEPTH) continue

    // The basin holds. Bake the footprint mask, its interior fade, the
    // shoreline samples and the centroid.
    const waterY = held.level - 0.02
    const mask = new Uint8Array(columns * rows)
    for (const index of held.cells) mask[index] = 1

    const shore: Vector3[] = []
    let sumX = 0
    let sumZ = 0
    // Interior distance by BFS rings from the rim: 0 at edge cells, walking
    // inward one step per ring, capped at 3 for the fade.
    const ringDistance = new Float32Array(columns * rows).fill(-1)
    let ring: number[] = []
    for (const index of held.cells) {
      const row = Math.floor(index / columns)
      const column = index % columns
      const x = originX + column * GRID_STEP
      const z = originZ + row * GRID_STEP
      sumX += x
      sumZ += z
      let edge = false
      for (const [dr, dc] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const next = (row + dr) * columns + (column + dc)
        if (!mask[next]) {
          edge = true
          break
        }
      }
      if (edge) {
        ringDistance[index] = 0
        ring.push(index)
        shore.push(new Vector3(x, waterY, z))
      }
    }
    for (let depth = 1; depth <= 3 && ring.length; depth++) {
      const nextRing: number[] = []
      for (const index of ring) {
        const row = Math.floor(index / columns)
        const column = index % columns
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const next = (row + dr) * columns + (column + dc)
          if (mask[next] && ringDistance[next] < 0) {
            ringDistance[next] = depth
            nextRing.push(next)
          }
        }
      }
      ring = nextRing
    }
    const interior = new Float32Array(columns * rows)
    for (const index of held.cells) {
      const distance = ringDistance[index] < 0 ? 3 : ringDistance[index]
      interior[index] = Math.min(1, distance / 3)
    }

    const centerX = sumX / held.cells.length
    const centerZ = sumZ / held.cells.length
    let boundingRadius = 0
    for (const index of held.cells) {
      const row = Math.floor(index / columns)
      const column = index % columns
      const x = originX + column * GRID_STEP
      const z = originZ + row * GRID_STEP
      boundingRadius = Math.max(boundingRadius, Math.hypot(x - centerX, z - centerZ))
    }

    return {
      waterY,
      center: new Vector3(centerX, waterY, centerZ),
      boundingRadius: boundingRadius + GRID_STEP,
      shore,
      depth: held.level - floor,
      grid: { originX, originZ, step: GRID_STEP, columns, rows, mask, interior },
    }
  }
  return undefined
}

/** Bilinear read of the interior-fade field at a world point (0 off-mask). */
const interiorAt = (grid: LakeGrid, x: number, z: number): number => {
  const { originX, originZ, step, columns, rows, interior } = grid
  const gx = (x - originX) / step
  const gz = (z - originZ) / step
  const column = Math.floor(gx)
  const row = Math.floor(gz)
  if (column < 0 || row < 0 || column >= columns - 1 || row >= rows - 1) return 0
  const fx = gx - column
  const fz = gz - row
  const a = interior[row * columns + column]
  const b = interior[row * columns + column + 1]
  const c = interior[(row + 1) * columns + column]
  const d = interior[(row + 1) * columns + column + 1]
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz
}

/** How much extra depth the bed assist adds at the deep heart. */
const BED_ASSIST = 0.45

/**
 * Deepen the discovered basin so the water reads as water, never sheen. The
 * assist scales with BOTH the natural depth (zero exactly at the shoreline)
 * and the footprint's interior fade (zero at the mask rim) — the outline
 * the flood discovered is untouched, and nothing outside it moves at all.
 */
export const withLakeBed = (sampler: HeightSampler, lake: LakeSite): HeightSampler => {
  const { waterY, center, boundingRadius, grid } = lake
  return (x, z) => {
    const bank = sampler(x, z)
    if (Math.hypot(x - center.x, z - center.z) > boundingRadius) return bank
    if (bank >= waterY) return bank
    const fade = interiorAt(grid, x, z)
    if (fade <= 0) return bank
    const depth = waterY - bank
    return bank - BED_ASSIST * fade * smoothstep(Math.min(1, depth / 0.5))
  }
}

/** Distance from a point to the lake's water edge (0 on/inside the shore
 *  ring) — the same cheap nearest-sample recipe the river uses, behind two
 *  fast paths: this runs per terrain vertex (~90k) and per flora attempt,
 *  so the far field must cost one hypot, and the inside test must run
 *  BEFORE the shore scan it would discard. */
export const lakeShoreDistance = (lake: LakeSite, x: number, z: number): number => {
  const fromCenter = Math.hypot(x - lake.center.x, z - lake.center.z)
  // Beyond every consumer's largest margin (the moisture falloff's 9), the
  // exact figure changes nothing.
  if (fromCenter > lake.boundingRadius + 12) return fromCenter - lake.boundingRadius
  if (fromCenter <= lake.boundingRadius && interiorAt(lake.grid, x, z) > 0) return 0
  let nearest = Infinity
  for (const point of lake.shore) {
    const distance = Math.hypot(point.x - x, point.z - z)
    if (distance < nearest) nearest = distance
  }
  return nearest
}
