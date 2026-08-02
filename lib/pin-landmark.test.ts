import { afterEach, describe, expect, it } from 'vitest'
import { LANDMARKS } from '~~/data/landmarks.gen'
import { getRoundChallenge, PIN_LANDMARK_TIERS, pinLandmarkCandidates } from '~~/lib/challenges'
import type { PinLandmarkChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

const entry = (slug: string, country: ISOCountryCode): [string, { country: ISOCountryCode }] => [
  slug,
  { country },
]

describe('PIN_LANDMARK_TIERS', () => {
  it('widens the scoring bands strictly below hard', () => {
    expect(PIN_LANDMARK_TIERS.easy.perfectDistanceKm).toBeGreaterThan(
      PIN_LANDMARK_TIERS.normal.perfectDistanceKm
    )
    expect(PIN_LANDMARK_TIERS.normal.perfectDistanceKm).toBeGreaterThan(
      PIN_LANDMARK_TIERS.hard.perfectDistanceKm
    )
    expect(PIN_LANDMARK_TIERS.easy.zeroDistanceKm).toBeGreaterThan(
      PIN_LANDMARK_TIERS.normal.zeroDistanceKm
    )
    expect(PIN_LANDMARK_TIERS.normal.zeroDistanceKm).toBeGreaterThan(
      PIN_LANDMARK_TIERS.hard.zeroDistanceKm
    )
  })

  it('keeps hard on the heritage-hunt bands so both modes share one taper', () => {
    expect(PIN_LANDMARK_TIERS.hard.perfectDistanceKm).toBe(150)
    expect(PIN_LANDMARK_TIERS.hard.zeroDistanceKm).toBe(3000)
    expect(PIN_LANDMARK_TIERS.hard.landmarksPerCountry).toBe(Infinity)
  })
})

describe('pinLandmarkCandidates', () => {
  const pool = [
    entry('icon-fr', 'FR'),
    entry('second-fr', 'FR'),
    entry('third-fr', 'FR'),
    entry('icon-it', 'IT'),
    entry('second-it', 'IT'),
    entry('icon-jp', 'JP'),
    entry('icon-us', 'US'),
    entry('icon-in', 'IN'),
    entry('icon-cn', 'CN'),
    entry('icon-br', 'BR'),
    entry('icon-eg', 'EG'),
    entry('icon-gr', 'GR'),
  ]

  it('keeps only each country icon on easy, in pool order', () => {
    const easy = pinLandmarkCandidates(pool, 'easy')
    expect(easy.map(([slug]) => slug)).toEqual([
      'icon-fr',
      'icon-it',
      'icon-jp',
      'icon-us',
      'icon-in',
      'icon-cn',
      'icon-br',
      'icon-eg',
      'icon-gr',
    ])
  })

  it('allows two per country on normal, everything on hard', () => {
    const normal = pinLandmarkCandidates(pool, 'normal')
    expect(normal.map(([slug]) => slug)).toContain('second-fr')
    expect(normal.map(([slug]) => slug)).not.toContain('third-fr')
    expect(pinLandmarkCandidates(pool, 'hard')).toEqual(pool)
  })

  it('widens back to the whole pool when the icon slice runs thin', () => {
    const tiny = pool.slice(0, 5)
    expect(pinLandmarkCandidates(tiny, 'easy')).toEqual(tiny)
  })
})

// --- The dealer, through the front door ----------------------------------------

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

describe('getPinLandmarkChallenge (via getRoundChallenge)', () => {
  it('stamps the tier bands into the payload per difficulty', async () => {
    process.env.FORCE_ROUND_TYPE = 'pin-landmark'
    const easy = (await getRoundChallenge({ game: game('easy') })) as PinLandmarkChallenge
    expect(easy._type).toBe('pin-landmark-challenge')
    expect(easy.perfectDistanceKm).toBe(300)
    expect(easy.zeroDistanceKm).toBe(5000)

    const hard = (await getRoundChallenge({ game: game('hard') })) as PinLandmarkChallenge
    expect(hard.perfectDistanceKm).toBe(150)
    expect(hard.zeroDistanceKm).toBe(3000)
  })

  it('deals only icon landmarks on easy', async () => {
    process.env.FORCE_ROUND_TYPE = 'pin-landmark'
    const icons = new Set(
      pinLandmarkCandidates(
        Object.entries(LANDMARKS).filter(([, landmark]) => landmark.coordinates),
        'easy'
      ).map(([slug]) => slug)
    )
    for (let deal = 0; deal < 15; deal++) {
      const dealt = (await getRoundChallenge({ game: game('easy') })) as PinLandmarkChallenge
      expect(icons.has(dealt.slug)).toBe(true)
    }
  })
})

describe('generated landmark order', () => {
  it('lists each country icon first, so the easy tier deals the famous ones', () => {
    // Guards the generator's resurrection merge: previously-fetched entries
    // append at the end, which must never demote a seed-file icon.
    const pool = Object.entries(LANDMARKS).filter(([, landmark]) => landmark.coordinates)
    const easy = pinLandmarkCandidates(pool, 'easy')
    const slugs = easy.map(([slug]) => slug)
    expect(slugs).toContain('eiffel-tower')
    expect(slugs).toContain('taj-mahal')
    expect(slugs).toContain('statue-of-liberty')
    expect(slugs).toContain('great-wall-of-china')

    const countries = easy.map(([, landmark]) => landmark.country)
    expect(new Set(countries).size).toBe(countries.length)
  })
})
