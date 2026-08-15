import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { LANDMARKS } from '~~/data/landmarks.gen'
import { famousPlaces, getRoundChallenge, PIN_LANDMARK_TIERS } from '~~/lib/challenges'
import { HERITAGE } from '~~/data/heritage.gen'
import type { Fame } from '~~/types/fame.types'
import type { PinLandmarkChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

const entry = (slug: string, fame: Fame): [string, { fame: Fame }] => [slug, { fame }]

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
  })
})

describe('famousPlaces', () => {
  const pool = [
    entry('icon-fr', 'major'),
    entry('second-fr', 'minor'),
    entry('third-fr', 'obscure'),
    entry('icon-it', 'major'),
    entry('second-it', 'minor'),
    entry('icon-jp', 'major'),
    entry('icon-us', 'major'),
    entry('icon-in', 'major'),
    entry('icon-cn', 'major'),
    entry('icon-br', 'major'),
    entry('icon-eg', 'major'),
    entry('icon-gr', 'major'),
  ]

  it('keeps only the icons on easy, in pool order', () => {
    const easy = famousPlaces(pool, 'easy')
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

  it('adds the minor tier on normal, everything on hard', () => {
    const normal = famousPlaces(pool, 'normal')
    expect(normal.map(([slug]) => slug)).toContain('second-fr')
    expect(normal.map(([slug]) => slug)).not.toContain('third-fr')
    expect(famousPlaces(pool, 'hard')).toEqual(pool)
  })

  it('widens back to the whole pool when the icon slice runs thin', () => {
    const tiny = pool.slice(0, 5)
    expect(famousPlaces(tiny, 'easy')).toEqual(tiny)
  })

  it('gates on the tier alone, so array order can never decide a difficulty', () => {
    // The old rule counted position within a country at deal time; a merge that
    // appended an entry ahead of its country's icon silently promoted it.
    const scrambled = [entry('third-fr', 'obscure'), ...pool.slice(0, 2), ...pool.slice(3)]
    expect(famousPlaces(scrambled, 'easy').map(([slug]) => slug)).not.toContain('third-fr')
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
      famousPlaces(
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

describe('generated place fame', () => {
  it('tiers each country icon major, so the easy tier deals the famous ones', () => {
    const pool = Object.entries(LANDMARKS).filter(([, landmark]) => landmark.coordinates)
    const easy = famousPlaces(pool, 'easy')
    const slugs = easy.map(([slug]) => slug)
    expect(slugs).toContain('eiffel-tower')
    expect(slugs).toContain('taj-mahal')
    expect(slugs).toContain('statue-of-liberty')
    expect(slugs).toContain('great-wall-of-china')

    const countries = easy.map(([, landmark]) => landmark.country)
    expect(new Set(countries).size).toBe(countries.length)
  })

  it('keeps one photo per slug, shared by both rosters, with no orphans', () => {
    // The two rosters live in ONE folder now. A subject both hold (Ha Long Bay
    // is a curated landmark AND a World Heritage site) must be one file with one
    // credit, and nothing on disk may be unreferenced.
    const directory = 'public/landmarks'
    const referenced = new Set(
      [...Object.values(LANDMARKS), ...Object.values(HERITAGE)].map(entry =>
        entry.image.replace('/landmarks/', '')
      )
    )
    for (const entry of [...Object.values(LANDMARKS), ...Object.values(HERITAGE)]) {
      expect(entry.image, entry.name).toMatch(/^\/landmarks\//)
      expect(existsSync(`public${entry.image}`), entry.image).toBe(true)
    }
    for (const file of readdirSync(directory)) {
      expect(referenced.has(file), `${file} is on disk but no entry points at it`).toBe(true)
    }
  })

  it('never ships the same photo twice', () => {
    const byHash = new Map<string, string[]>()
    for (const file of readdirSync('public/landmarks')) {
      const hash = createHash('md5')
        .update(readFileSync(`public/landmarks/${file}`))
        .digest('hex')
      byHash.set(hash, [...(byHash.get(hash) ?? []), file])
    }
    const duplicates = [...byHash.values()].filter(files => files.length > 1)
    expect(duplicates.map(files => files.join(' = '))).toEqual([])
  })

  it('credits a shared photo to the roster that owns the file', () => {
    for (const [slug, site] of Object.entries(HERITAGE)) {
      const curated = LANDMARKS[slug]
      if (!curated) continue
      expect(site.image, slug).toBe(curated.image)
      expect(site.credit, slug).toBe(curated.credit)
      expect(site.license, slug).toBe(curated.license)
    }
  })

  it('gives every landmark and heritage site a tier', () => {
    for (const [slug, entry] of Object.entries(LANDMARKS)) {
      expect(entry.fame, slug).toBeDefined()
    }
    for (const [slug, site] of Object.entries(HERITAGE)) {
      expect(site.fame, slug).toBeDefined()
    }
  })

  it('tiers exactly one major heritage site per country, so easy deals icons', () => {
    const majorsPerCountry = new Map<ISOCountryCode, number>()
    for (const site of Object.values(HERITAGE)) {
      if (site.fame !== 'major') continue
      majorsPerCountry.set(site.country, (majorsPerCountry.get(site.country) ?? 0) + 1)
    }
    for (const [country, count] of majorsPerCountry) {
      expect(count, country).toBe(1)
    }
    // Heritage Hunt needs three distinct countries per deal at any difficulty.
    expect(majorsPerCountry.size).toBeGreaterThanOrEqual(3)
  })
})
