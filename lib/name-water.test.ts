import { afterEach, describe, expect, it } from 'vitest'
import {
  getRoundChallenge,
  HIGHLANDS_TIERS,
  NAME_WATER_TIERS,
  nameWaterCandidates,
  prominenceCandidates,
} from '~~/lib/challenges'
import type { WaterBlitzChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/** A feature whose prominence (footprint × shores) is exactly `rank`. */
const feature = (id: number, footprint: number, shores = 1) => ({
  id,
  bounds: [0, 0, footprint, 1] as [number, number, number, number],
  countries: Array<ISOCountryCode>(shores).fill('FR'),
})

describe('NAME_WATER_TIERS', () => {
  it('keeps easy to oceans and seas, opens lakes from normal up', () => {
    expect(NAME_WATER_TIERS.easy.kinds).toEqual(['ocean', 'sea'])
    expect(NAME_WATER_TIERS.easy.kinds).not.toContain('lake')
    expect(NAME_WATER_TIERS.normal.kinds).toContain('lake')
    expect(NAME_WATER_TIERS.hard.kinds).toContain('lake')
    // Oceans deal everywhere — prominence keeps them in every slice.
    expect(NAME_WATER_TIERS.normal.kinds).toContain('ocean')
    expect(NAME_WATER_TIERS.hard.kinds).toContain('ocean')
  })

  it('widens the pool with difficulty, hard taking everything', () => {
    expect(NAME_WATER_TIERS.easy.poolFraction).toBeLessThan(NAME_WATER_TIERS.normal.poolFraction)
    expect(NAME_WATER_TIERS.hard.poolFraction).toBe(1)
  })
})

describe('HIGHLANDS_TIERS', () => {
  it('keeps easy to ranges and deserts, opens plateaus from normal up', () => {
    expect(HIGHLANDS_TIERS.easy.kinds).toEqual(['range', 'desert'])
    expect(HIGHLANDS_TIERS.easy.kinds).not.toContain('plateau')
    expect(HIGHLANDS_TIERS.normal.kinds).toContain('plateau')
    expect(HIGHLANDS_TIERS.hard.kinds).toContain('plateau')
  })

  it('widens the pool with difficulty, hard taking everything', () => {
    expect(HIGHLANDS_TIERS.easy.poolFraction).toBeLessThan(HIGHLANDS_TIERS.normal.poolFraction)
    expect(HIGHLANDS_TIERS.normal.poolFraction).toBeLessThan(HIGHLANDS_TIERS.hard.poolFraction)
    expect(HIGHLANDS_TIERS.hard.poolFraction).toBe(1)
  })
})

describe('prominenceCandidates', () => {
  it('returns the whole pool untouched at fraction 1', () => {
    // River-run and shared-shores pass no fraction — they must keep dealing
    // the full atlas.
    const pool = Array.from({ length: 40 }, (_, index) => feature(index, 40 - index))
    expect(prominenceCandidates(pool, 1)).toHaveLength(40)
  })
})

describe('getWaterBlitzChallenge for highlands (via getRoundChallenge)', () => {
  const game = (difficulty: Game['difficulty']): Game =>
    ({
      variant: 'world',
      difficulty,
      rounds: [{}],
      players: { a: { phase: 'group-challenge' } },
    }) as unknown as Game

  afterEach(() => {
    delete process.env.FORCE_ROUND_TYPE
  })

  it('deals only ranges and deserts on easy, never plateaus', async () => {
    process.env.FORCE_ROUND_TYPE = 'highlands'
    for (let deal = 0; deal < 15; deal++) {
      const dealt = (await getRoundChallenge({ game: game('easy') })) as WaterBlitzChallenge
      expect(dealt._type).toBe('water-blitz-challenge')
      expect(['range', 'desert']).toContain(dealt.kind)
    }
  })
})

describe('generated oceans', () => {
  it('ships the four playable oceans with enough shores to deal', async () => {
    const { WATER_FEATURES } = await import('~~/data/water.gen')
    for (const id of ['pacific-ocean', 'atlantic-ocean', 'indian-ocean', 'arctic-ocean']) {
      const ocean = WATER_FEATURES[id]
      expect(ocean?.kind).toBe('ocean')
      expect(ocean.countries.length).toBeGreaterThanOrEqual(2)
    }
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
