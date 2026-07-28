import { describe, expect, it } from 'vitest'
import { generateTiles } from '~~/lib/tiles'
import { createTilePath } from './path'
import { createHeightSampler } from './terrain'
import { pickPondSite, withPondBasin } from './water'

const SEEDS = [...Array(80)].map((_, index) => `pond-${index}`)

const boardFor = (seed: string) => {
  const tiles = generateTiles('medium', seed)
  const sampler = createHeightSampler(seed)
  const path = createTilePath(seed, tiles, sampler)
  return { tiles, sampler, path }
}

describe('pickPondSite', () => {
  it('is deterministic per seed', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const { tiles, path } = boardFor(seed)
      expect(pickPondSite(seed, tiles, path)).toEqual(pickPondSite(seed, tiles, path))
    }
  })

  it('stays a rare treat — some boards get one, most rules hold it back', () => {
    const dealt = SEEDS.filter(seed => {
      const { tiles, path } = boardFor(seed)
      return pickPondSite(seed, tiles, path) !== undefined
    }).length
    expect(dealt).toBeGreaterThan(SEEDS.length * 0.1)
    expect(dealt).toBeLessThan(SEEDS.length * 0.65)
  })

  it('only ever claims a plain tile with plain neighbours, below the track', () => {
    for (const seed of SEEDS) {
      const { tiles, path } = boardFor(seed)
      const site = pickPondSite(seed, tiles, path)
      if (!site) continue

      expect(site.tileIndex).toBeGreaterThanOrEqual(2)
      expect(site.tileIndex).toBeLessThan(tiles.length - 2)
      for (const offset of [-1, 0, 1]) {
        expect(tiles[site.tileIndex + offset].type).toBe('normal')
      }
      expect(site.waterY).toBeLessThan(site.center.y)
      expect(site.floorY).toBeLessThan(site.waterY)
      expect(site.basinRadius).toBeGreaterThan(site.waterRadius * 0.9)
    }
  })
})

describe('withPondBasin', () => {
  it('carves to the floor at the centre and leaves far terrain untouched', () => {
    const seed = SEEDS.find(candidate => {
      const { tiles, path } = boardFor(candidate)
      return pickPondSite(candidate, tiles, path) !== undefined
    })!
    const { tiles, sampler, path } = boardFor(seed)
    const site = pickPondSite(seed, tiles, path)!
    const carved = withPondBasin(sampler, site)

    expect(carved(site.center.x, site.center.z)).toBeCloseTo(site.floorY, 6)
    const farX = site.center.x + site.basinRadius * 1.01
    expect(carved(farX, site.center.z)).toBe(sampler(farX, site.center.z))
    // Water actually shows: the carved surface under the disc sits below it
    expect(carved(site.center.x, site.center.z)).toBeLessThan(site.waterY)
  })
})
