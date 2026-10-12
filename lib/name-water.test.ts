import { describe, expect, it } from 'vitest'
import {
  NAME_WATER_TIERS,
  nameWaterCandidates,
  prominenceCandidates,
  waterFeaturePool,
} from '~~/lib/challenges'
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

describe('prominenceCandidates', () => {
  it('returns the whole pool untouched at fraction 1', () => {
    const pool = Array.from({ length: 40 }, (_, index) => feature(index, 40 - index))
    expect(prominenceCandidates(pool, 1)).toHaveLength(40)
  })
})

// The world easy slice is the famous water; the tier fraction is sized so the
// slice holds its count when the atlas loses fake shores.
describe('the world Name That Water pools', () => {
  const pool = async (difficulty: Game['difficulty']) =>
    nameWaterCandidates(
      await waterFeaturePool(
        { regions: [], difficulty } as unknown as Game,
        NAME_WATER_TIERS[difficulty].kinds
      ),
      difficulty
    ).map(feature => feature.id)

  it('keeps easy at its size, the Gulf of Mexico and the Persian Gulf in it', async () => {
    const easy = await pool('easy')
    expect(easy).toEqual(expect.arrayContaining(['gulf-of-mexico', 'persian-gulf']))
    expect(Math.abs(easy.length - 24)).toBeLessThanOrEqual(2)
  })

  it('keeps normal at its size, the great shared lakes in it', async () => {
    const normal = await pool('normal')
    expect(normal).toEqual(
      expect.arrayContaining(['lake-erie', 'lake-malawi', 'strait-of-magellan', 'salish-sea'])
    )
    expect(Math.abs(normal.length - 74)).toBeLessThanOrEqual(2)
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
    // frame however tight the crop. Roster keys are written by hand and reach
    // past the outline (the Pampas' Uruguay), and an ocean frames its board's
    // coast instead, so this holds for the geometry's own keys alone.
    for (const feature of Object.values(WATER_FEATURES)) {
      if (feature.countries.length < 3 || feature.fame) continue
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
    const slice = (difficulty: Game['difficulty']) =>
      Math.ceil(pool.length * NAME_WATER_TIERS[difficulty].poolFraction)
    const easy = nameWaterCandidates(pool, 'easy')
    expect(easy).toHaveLength(slice('easy'))
    // Prominence-sorted: the famous giants, not the first-listed.
    expect(easy.map(candidate => candidate.id)).toEqual([...Array(slice('easy')).keys()])
    expect(nameWaterCandidates(pool, 'normal')).toHaveLength(slice('normal'))
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
