import { afterEach, describe, expect, it } from 'vitest'
import {
  getRoundChallenge,
  HIGHLANDS_TIERS,
  NAME_WATER_TIERS,
  nameWaterCandidates,
  prominenceCandidates,
} from '~~/lib/challenges'
import { isCountryInPlay, playableWorldCountries } from '~~/lib/game-rules'
import type { WaterBlitzChallenge } from '~~/types/challenges/group-modes.type'
import { gameDifficulties, type Game, type GameRules } from '~~/types/game.types'
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

  // The dealt list is the answer key AND the "n of m found" counter, so a
  // benched micro-nation in it is an unreachable round: the typed console and
  // the map both refuse to select what the game has taken out of play.
  it('never requires a country the game has benched', async () => {
    for (const kind of ['river-run', 'shared-shores', 'highlands'] as const) {
      process.env.FORCE_ROUND_TYPE = kind
      for (const difficulty of gameDifficulties) {
        const rules = game(difficulty)
        const inPlay = new Set(playableWorldCountries(rules))
        for (let deal = 0; deal < 15; deal++) {
          const dealt = (await getRoundChallenge({ game: rules })) as WaterBlitzChallenge
          expect(dealt._type).toBe('water-blitz-challenge')
          for (const isoCode of dealt.countries) {
            expect(inPlay.has(isoCode), `${dealt.featureId} requires benched ${isoCode}`).toBe(true)
          }
        }
      }
    }
  })
})

/**
 * The three-country floor is measured on the key the table can actually reach,
 * never on the shipped list — otherwise benching a micro-nation would leave a
 * "name 3" round with two reachable answers and no third to find. The Ligurian
 * (FR/IT/MC) and Tyrrhenian (FR/IT/VA) seas are the shipped keys that fall
 * under it once Monaco and the Vatican are out, so they simply don't deal
 * below hard.
 */
describe('the three-country floor and benched micro-nations', () => {
  const shores = (id: string, rules: GameRules, features: Record<string, { countries: string[] }>) =>
    features[id].countries.filter(isoCode => isCountryInPlay(rules, isoCode as ISOCountryCode))

  it('measures the floor on the in-play key, not the shipped one', async () => {
    const { WATER_FEATURES } = await import('~~/data/water.gen')
    for (const id of ['ligurian-sea', 'tyrrhenian-sea']) {
      expect(WATER_FEATURES[id].countries.length).toBeGreaterThanOrEqual(3)
      expect(shores(id, { variant: 'world', difficulty: 'normal' }, WATER_FEATURES).length).toBe(2)
      expect(
        shores(id, { variant: 'world', difficulty: 'hard' }, WATER_FEATURES).length
      ).toBeGreaterThanOrEqual(3)
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

/**
 * ViewWaterBlitz relaxes the camera's pad floor to 12 so the feature fills the
 * frame. Mirrors `frameForBoxes` in GameMap.vue — the arithmetic lives in a
 * component, so the properties that make the tightening safe are asserted here
 * against the real geometry.
 */
const waterFrame = (
  bounds: [number, number, number, number],
  viewAspect: number,
  padFloor: number
) => {
  const [minX, minY] = bounds
  const [maxX, maxY] = [bounds[0] + bounds[2], bounds[1] + bounds[3]]
  const pad = Math.max((maxX - minX) * 0.35, (maxY - minY) * 0.35, padFloor)
  let [x, y] = [minX - pad, minY - pad]
  let width = maxX - minX + pad * 2
  let height = maxY - minY + pad * 2
  if (width / height > viewAspect) {
    const grow = width / viewAspect - height
    y -= grow / 2
    height += grow
  } else {
    const grow = height * viewAspect - width
    x -= grow / 2
    width += grow
  }
  // WORLD_BOX.width / MAX_ZOOM — the floor frameForBoxes now honours.
  const minWidth = 2000 / 40
  if (width < minWidth) {
    const grow = minWidth / width
    x += width / 2 - (width * grow) / 2
    y += height / 2 - (height * grow) / 2
    width *= grow
    height *= grow
  }
  return { x, y, width, height }
}

const WATER_PAD_FLOOR = 12
// Desktop 16:9 and a tall phone — the aspect correction differs sharply.
const ASPECTS = [16 / 9, 0.5]

describe('water-mode camera frame', () => {
  it('never asks for a view tighter than the camera can hold', async () => {
    const { WATER_FEATURES } = await import('~~/data/water.gen')
    for (const feature of Object.values(WATER_FEATURES)) {
      for (const aspect of ASPECTS) {
        const { width } = waterFrame(feature.bounds, aspect, WATER_PAD_FLOOR)
        expect(width, `${feature.id} at aspect ${aspect}`).toBeGreaterThanOrEqual(2000 / 40 - 0.001)
      }
    }
  })

  it('needs that floor — the narrowest feature would out-zoom the camera', async () => {
    const { WATER_FEATURES } = await import('~~/data/water.gen')
    // The Bosporus spans half a map unit. Without the guard the pad alone
    // leaves it far under MAX_ZOOM, so the clamp — not the frame — would
    // decide the shot, and it recentres nothing.
    const unguarded = (bounds: [number, number, number, number], viewAspect: number) => {
      const pad = Math.max(bounds[2] * 0.35, bounds[3] * 0.35, WATER_PAD_FLOOR)
      const width = bounds[2] + pad * 2
      const height = bounds[3] + pad * 2
      return width / height > viewAspect ? width : height * viewAspect
    }
    const narrowest = Math.min(
      ...Object.values(WATER_FEATURES).flatMap(entry =>
        ASPECTS.map(aspect => unguarded(entry.bounds, aspect))
      )
    )
    expect(narrowest).toBeLessThan(2000 / 40)
  })

  it('keeps every answer country on screen at the tightened floor', async () => {
    const { WATER_FEATURES } = await import('~~/data/water.gen')
    const { MAP_BOUNDS, MAP_REGIONS } = await import('~~/data/map.gen')
    // A waterway runs through the countries it asks for, so their land stays in
    // frame however tight the crop — only a giant's centroid falls out.
    for (const feature of Object.values(WATER_FEATURES)) {
      if (feature.countries.length < 3) continue
      for (const aspect of ASPECTS) {
        const frame = waterFrame(feature.bounds, aspect, WATER_PAD_FLOOR)
        for (const isoCode of feature.countries) {
          const rings = MAP_REGIONS[isoCode] ?? [MAP_BOUNDS[isoCode]]
          const onScreen = rings.some(
            ring =>
              ring &&
              ring[0] < frame.x + frame.width &&
              ring[0] + ring[2] > frame.x &&
              ring[1] < frame.y + frame.height &&
              ring[1] + ring[3] > frame.y
          )
          expect(onScreen, `${feature.id} lost ${isoCode} at aspect ${aspect}`).toBe(true)
        }
      }
    }
  })

  it('gives the feature a bigger share of the frame than the default floor', async () => {
    const { WATER_FEATURES } = await import('~~/data/water.gen')
    const share = (padFloor: number) => {
      const shares = Object.values(WATER_FEATURES)
        .map(entry => entry.bounds[2] / waterFrame(entry.bounds, 16 / 9, padFloor).width)
        .sort((a, b) => a - b)
      return shares[shares.length >> 1]
    }
    expect(share(WATER_PAD_FLOOR)).toBeGreaterThan(share(60) * 2)
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
