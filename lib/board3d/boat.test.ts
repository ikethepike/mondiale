import { describe, expect, it } from 'vitest'
import { pickBoatMooring } from './boat'
import { pickLakeSite, withLakeBed } from './lake'
import { createTilePath } from './path'
import { createHeightSampler, withEdgeFalloff, withPathShelf } from './terrain'
import { pickPondSite, withPondBasin } from './water'
import type { Tile } from '~~/types/game.types'

const worldFor = (seed: string, count = 65) => {
  const tiles: Tile[] = Array.from({ length: count }, (_, position) => ({
    position,
    type: 'normal' as const,
  }))
  const rawSampler = withEdgeFalloff(createHeightSampler(seed))
  const path = createTilePath(seed, tiles, rawSampler)
  const pond = pickPondSite(seed, tiles, path)
  const shelved = withPathShelf(rawSampler, path.shelfPoints, path.spacing * 1.05)
  const ponded = pond ? withPondBasin(shelved, pond) : shelved
  const lake = pickLakeSite(seed, path, pond, undefined, undefined, ponded)
  const sampler = lake ? withLakeBed(ponded, lake) : ponded
  const mooring = pickBoatMooring(seed, pond, lake, path.spacing, sampler)
  return { mooring, pond, lake, sampler }
}

describe('pickBoatMooring', () => {
  it('is deterministic and only deals on watered boards', () => {
    let moored = 0
    for (let index = 0; index < 60; index++) {
      const seed = `boat-${index}`
      const { mooring, pond, lake } = worldFor(seed)
      const again = worldFor(seed).mooring
      expect(Boolean(mooring)).toBe(Boolean(again))
      if (mooring && again) expect(mooring.position.equals(again.position)).toBe(true)
      if (mooring) {
        moored++
        expect(pond || lake).toBeTruthy()
      }
    }
    expect(moored).toBeGreaterThan(5)
  })

  it('floats on honest depth at the water surface', () => {
    for (let index = 0; index < 60; index++) {
      const { mooring, pond, lake, sampler } = worldFor(`boat-${index}`)
      if (!mooring) continue
      const waterY = lake ? lake.waterY : pond!.waterY
      expect(mooring.position.y).toBe(waterY)
      expect(waterY - sampler(mooring.position.x, mooring.position.z)).toBeGreaterThanOrEqual(0.12)
    }
  })
})
