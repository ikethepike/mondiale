import { describe, expect, it } from 'vitest'
import { pickLakeSite, withLakeBed } from './lake'
import { createTilePath } from './path'
import { pickRiverPath, withRiverBed } from './river'
import { pickScenerySites } from './scenery'
import { pickSummitSite, withSummitMassif } from './summit'
import { createHeightSampler, EDGE_FADE_START, withEdgeFalloff, withPathShelf } from './terrain'
import { pickTownSite } from './town'
import { pickPondSite, withPondBasin } from './water'
import type { Tile } from '~~/types/game.types'

/** Mirror the builder's chain — the town is picked after the survey
 *  furniture, over the final composed sampler. */
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
  const rivered = river ? withRiverBed(sculpted, river) : sculpted
  const lake = pickLakeSite(seed, path, pond, summit, river, rivered)
  const sampler = lake ? withLakeBed(rivered, lake) : rivered
  const scenery = pickScenerySites(seed, path, pond, summit, sampler, river, lake)
  const town = pickTownSite(seed, path, pond, summit, river, scenery, sampler, lake)
  return { town, path, sampler, river, lake }
}

type World = ReturnType<typeof worldFor>
type DealtWorld = World & { town: NonNullable<World['town']> }

const dealtWorlds = (prefix: string, want: number, scan = 120): DealtWorld[] => {
  const worlds: DealtWorld[] = []
  for (let index = 0; index < scan && worlds.length < want; index++) {
    const world = worldFor(`${prefix}-${index}`)
    if (world.town) worlds.push(world as DealtWorld)
  }
  expect(worlds.length).toBeGreaterThan(0)
  return worlds
}

describe('pickTownSite', () => {
  it('is deterministic per seed', () => {
    for (let index = 0; index < 40; index++) {
      const seed = `town-det-${index}`
      const first = worldFor(seed).town
      const second = worldFor(seed).town
      expect(Boolean(first)).toBe(Boolean(second))
      if (!first || !second) continue
      expect(first.houses.length).toBe(second.houses.length)
      first.houses.forEach((house, at) => {
        expect(house.x).toBe(second.houses[at].x)
        expect(house.yaw).toBe(second.houses[at].yaw)
        expect(house.kind).toBe(second.houses[at].kind)
      })
      return
    }
  })

  it('deals a hamlet on roughly a fifth of boards', () => {
    let dealt = 0
    for (let index = 0; index < 100; index++) {
      if (worldFor(`town-rate-${index}`).town) dealt++
    }
    expect(dealt).toBeGreaterThan(8)
    expect(dealt).toBeLessThan(38)
  })

  it('huddles 5–7 houses with exactly one tower, apart and on their ground', () => {
    for (const { town, sampler } of dealtWorlds('town-shape', 4)) {
      expect(town.houses.length).toBeGreaterThanOrEqual(5)
      expect(town.houses.length).toBeLessThanOrEqual(7)
      expect(town.houses.filter(house => house.kind === 'tower')).toHaveLength(1)
      for (const house of town.houses) {
        expect(house.y).toBeCloseTo(sampler(house.x, house.z), 6)
        expect(Math.hypot(house.x - town.center.x, house.z - town.center.z)).toBeLessThanOrEqual(
          town.radius
        )
        for (const other of town.houses) {
          if (other === house) continue
          expect(Math.hypot(other.x - house.x, other.z - house.z)).toBeGreaterThanOrEqual(1.6)
        }
      }
    }
  })

  it('keeps every house clear of the track, dry, and inside the page', () => {
    for (const { town, path, river, lake } of dealtWorlds('town-clear', 4)) {
      for (const house of town.houses) {
        expect(Math.hypot(house.x, house.z)).toBeLessThanOrEqual(EDGE_FADE_START)
        for (const shelf of path.shelfPoints) {
          expect(Math.hypot(shelf.x - house.x, shelf.z - house.z)).toBeGreaterThanOrEqual(
            path.spacing * 1.6 - 1e-6
          )
        }
        if (river) {
          for (const point of river.points) {
            expect(Math.hypot(point.x - house.x, point.z - house.z)).toBeGreaterThanOrEqual(
              river.width + 1.2 - 1e-6
            )
          }
        }
        if (lake) {
          const inLake =
            Math.hypot(house.x - lake.center.x, house.z - lake.center.z) <
            lake.boundingRadius - 4
          expect(inLake).toBe(false)
        }
      }
    }
  })

  it('stands the huddle on near-level valley ground', () => {
    // The siting bound is MAX_SPREAD (1.15) across the plot's rings; houses
    // jitter between rings, so their spread stays within a hair of it.
    for (const { town } of dealtWorlds('town-shape', 4)) {
      const heights = town.houses.map(house => house.y)
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1.25)
    }
  })
})
