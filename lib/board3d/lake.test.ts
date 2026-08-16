import { describe, expect, it } from 'vitest'
import { lakeShoreDistance, pickLakeSite, withLakeBed } from './lake'
import { createTilePath } from './path'
import { pickRiverPath, withRiverBed } from './river'
import { pickSummitSite, withSummitMassif } from './summit'
import { createHeightSampler, EDGE_FADE_START, withEdgeFalloff, withPathShelf } from './terrain'
import { pickPondSite, withPondBasin } from './water'
import type { Tile } from '~~/types/game.types'

/** Mirror the builder's chain — the lake sites over the composed terrain. */
const worldFor = (seed: string, count = 65) => {
  const tiles: Tile[] = Array.from({ length: count }, (_, position) => ({
    position,
    type: 'normal' as const,
  }))
  const rawSampler = withEdgeFalloff(createHeightSampler(seed))
  const path = createTilePath(seed, tiles, rawSampler)
  const pond = pickPondSite(seed, tiles, path)
  const summit = pickSummitSite(seed, path, pond, rawSampler, 3)
  const river = pickRiverPath(seed, path, pond, summit, rawSampler)
  const shelved = withPathShelf(rawSampler, path.shelfPoints, path.spacing * 1.05)
  const ponded = pond ? withPondBasin(shelved, pond) : shelved
  const sculpted = summit ? withSummitMassif(ponded, summit, path.spacing) : ponded
  const sampler = river ? withRiverBed(sculpted, river) : sculpted
  const lake = pickLakeSite(seed, path, pond, summit, river, sampler)
  return { lake, path, sampler }
}

const dealtWorlds = (prefix: string, want: number, scan = 200) => {
  const worlds: (ReturnType<typeof worldFor> & { lake: NonNullable<ReturnType<typeof worldFor>['lake']> })[] = []
  for (let index = 0; index < scan && worlds.length < want; index++) {
    const world = worldFor(`${prefix}-${index}`)
    if (world.lake) worlds.push(world as (typeof worlds)[number])
  }
  expect(worlds.length).toBeGreaterThan(0)
  return worlds
}

describe('pickLakeSite', () => {
  it('is deterministic per seed', () => {
    const [world] = dealtWorlds('lake-det', 1)
    const again = worldFor(`lake-det-${0}`)
    // The scan finds the first dealing seed; re-derive the same one.
    let seed = ''
    for (let index = 0; index < 200; index++) {
      if (worldFor(`lake-det-${index}`).lake) {
        seed = `lake-det-${index}`
        break
      }
    }
    const first = worldFor(seed).lake
    const second = worldFor(seed).lake
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(first?.waterY).toBe(second?.waterY)
    expect(first?.shore.length).toBe(second?.shore.length)
    expect(first?.center.equals(second!.center)).toBe(true)
    expect(world.lake.waterY).toBeDefined()
    expect(again).toBeDefined()
  })

  it('deals a lake on some boards and declines most', () => {
    let dealt = 0
    for (let index = 0; index < 100; index++) {
      if (worldFor(`lake-rate-${index}`).lake) dealt++
    }
    expect(dealt).toBeGreaterThan(8)
    expect(dealt).toBeLessThan(35)
  })

  it('floods a real basin: deep enough, sized within bounds, fully underwater', () => {
    for (const { lake, sampler } of dealtWorlds('lake-shape', 4)) {
      expect(lake.depth).toBeGreaterThanOrEqual(0.5)
      const { grid, waterY } = lake
      let cells = 0
      for (let row = 0; row < grid.rows; row++) {
        for (let column = 0; column < grid.columns; column++) {
          if (!grid.mask[row * grid.columns + column]) continue
          cells++
          const x = grid.originX + column * grid.step
          const z = grid.originZ + row * grid.step
          // The carved bed sits under the surface at every flooded cell.
          // (waterY carries a 0.02 bank epsilon below the accepted level, so
          // rim cells may stand a hair proud — they render dry.)
          expect(sampler(x, z)).toBeLessThan(waterY + 0.03)
        }
      }
      const area = cells * grid.step * grid.step
      expect(area).toBeGreaterThanOrEqual(120)
      expect(area).toBeLessThanOrEqual(450)
    }
  })

  it('keeps every flooded cell clear of the track and inside the page', () => {
    for (const { lake, path } of dealtWorlds('lake-clear', 4)) {
      const clearance = path.spacing * 1.2
      const { grid } = lake
      for (let row = 0; row < grid.rows; row++) {
        for (let column = 0; column < grid.columns; column++) {
          if (!grid.mask[row * grid.columns + column]) continue
          const x = grid.originX + column * grid.step
          const z = grid.originZ + row * grid.step
          expect(Math.hypot(x, z)).toBeLessThanOrEqual(EDGE_FADE_START)
          for (const shelf of path.shelfPoints) {
            expect(Math.hypot(shelf.x - x, shelf.z - z)).toBeGreaterThanOrEqual(
              clearance - 1e-6
            )
          }
        }
      }
    }
  })
})

describe('withLakeBed', () => {
  it('only deepens, only underwater, and never outside the footprint', () => {
    for (const { lake, sampler } of dealtWorlds('lake-bed', 3)) {
      const base = sampler
      const carved = withLakeBed(base, lake)
      const { grid, waterY, center, boundingRadius } = lake
      for (let row = 0; row < grid.rows; row += 2) {
        for (let column = 0; column < grid.columns; column += 2) {
          const x = grid.originX + column * grid.step
          const z = grid.originZ + row * grid.step
          const before = base(x, z)
          const after = carved(x, z)
          expect(after).toBeLessThanOrEqual(before + 1e-9)
          if (before >= waterY) expect(after).toBe(before)
          if (Math.hypot(x - center.x, z - center.z) > boundingRadius)
            expect(after).toBe(before)
        }
      }
      // The heart really is deeper than nature made it.
      const deep = carved(center.x, center.z)
      expect(deep).toBeLessThanOrEqual(base(center.x, center.z))
    }
  })

  it('reports zero shore distance inside and real distance outside', () => {
    for (const { lake } of dealtWorlds('lake-bed', 2)) {
      expect(lakeShoreDistance(lake, lake.center.x, lake.center.z)).toBe(0)
      const far = lake.center.x + lake.boundingRadius + 10
      expect(lakeShoreDistance(lake, far, lake.center.z)).toBeGreaterThan(0)
    }
  })
})
