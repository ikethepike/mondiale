import { describe, expect, it } from 'vitest'
import { BOARD_BIOMES, pickBoardBiome } from './biomes'

describe('pickBoardBiome', () => {
  it('is deterministic per seed', () => {
    for (let index = 0; index < 20; index++) {
      const seed = `biome-${index}`
      expect(pickBoardBiome(seed).name).toBe(pickBoardBiome(seed).name)
    }
  })

  it('reaches every biome, parchment most often', () => {
    const dealt = new Map<string, number>()
    for (let index = 0; index < 200; index++) {
      const { name } = pickBoardBiome(`biome-deal-${index}`)
      dealt.set(name, (dealt.get(name) ?? 0) + 1)
    }
    for (const name of Object.keys(BOARD_BIOMES)) {
      expect(dealt.get(name) ?? 0, name).toBeGreaterThan(0)
    }
    expect(dealt.get('parchment')).toBe(Math.max(...dealt.values()))
  })
})
