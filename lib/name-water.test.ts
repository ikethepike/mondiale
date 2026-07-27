import { describe, expect, it } from 'vitest'
import { NAME_WATER_TIERS, nameWaterCandidates } from '~~/lib/challenges'
import type { ISOCountryCode } from '~~/types/geography.types'

/** A feature whose prominence (footprint × shores) is exactly `rank`. */
const feature = (id: number, footprint: number, shores = 1) => ({
  id,
  bounds: [0, 0, footprint, 1] as [number, number, number, number],
  countries: Array<ISOCountryCode>(shores).fill('FR'),
})

describe('NAME_WATER_TIERS', () => {
  it('keeps easy to seas, opens lakes from normal up', () => {
    expect(NAME_WATER_TIERS.easy.kinds).toEqual(['sea'])
    expect(NAME_WATER_TIERS.normal.kinds).toContain('lake')
    expect(NAME_WATER_TIERS.hard.kinds).toContain('lake')
  })

  it('widens the pool with difficulty, hard taking everything', () => {
    expect(NAME_WATER_TIERS.easy.poolFraction).toBeLessThan(NAME_WATER_TIERS.normal.poolFraction)
    expect(NAME_WATER_TIERS.hard.poolFraction).toBe(1)
  })
})

describe('nameWaterCandidates', () => {
  const pool = Array.from({ length: 40 }, (_, index) => feature(index, 40 - index))

  it('serves hard the whole pool', () => {
    expect(nameWaterCandidates(pool, 'hard')).toHaveLength(40)
  })

  it('slices the most prominent fraction for easy and normal', () => {
    const easy = nameWaterCandidates(pool, 'easy')
    expect(easy).toHaveLength(10)
    // Prominence-sorted: the famous giants, not the first-listed.
    expect(easy.map(candidate => candidate.id)).toEqual([...Array(10).keys()])
    expect(nameWaterCandidates(pool, 'normal')).toHaveLength(24)
  })

  it('ranks by footprint × shore count, not footprint alone', () => {
    const crowded = feature(100, 2, 12)
    const vast = feature(101, 10, 1)
    const [first] = nameWaterCandidates([vast, crowded], 'easy')
    expect(first.id).toBe(100)
  })

  it('never starves a small variant below the minimum spread', () => {
    const small = Array.from({ length: 12 }, (_, index) => feature(index, 12 - index))
    expect(nameWaterCandidates(small, 'easy')).toHaveLength(8)
    const tiny = small.slice(0, 5)
    expect(nameWaterCandidates(tiny, 'easy')).toHaveLength(5)
  })
})
