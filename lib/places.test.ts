import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { PLACES } from '~~/data/places.gen'
import { getRoundChallenge, PIN_LANDMARK_TIERS } from '~~/lib/challenges'
import {
  curatedPlaces,
  dealableHeritage,
  dealableLandmarks,
  famousPlaces,
  heritagePlaces,
} from '~~/lib/places'
import type { Fame } from '~~/types/fame.types'
import type { PinLandmarkChallenge } from '~~/types/challenges/group-modes.type'
import type { CuratedPlace, HeritagePlace } from '~~/types/places.types'
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
  const fameOf = (place: { fame: Fame }) => place.fame
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
    expect(famousPlaces(pool, 'easy', fameOf).map(([slug]) => slug)).toEqual([
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
    const normal = famousPlaces(pool, 'normal', fameOf).map(([slug]) => slug)
    expect(normal).toContain('second-fr')
    expect(normal).not.toContain('third-fr')
    expect(famousPlaces(pool, 'hard', fameOf)).toEqual(pool)
  })

  it('widens back to the whole pool when the icon slice runs thin', () => {
    const tiny = pool.slice(0, 5)
    expect(famousPlaces(tiny, 'easy', fameOf)).toEqual(tiny)
  })

  it('gates on the tier alone, so array order can never decide a difficulty', () => {
    // The old rule counted position within a country at deal time; a merge that
    // appended an entry ahead of its country's icon silently promoted it.
    const scrambled = [entry('third-fr', 'obscure'), ...pool.slice(0, 2), ...pool.slice(3)]
    expect(famousPlaces(scrambled, 'easy', fameOf).map(([slug]) => slug)).not.toContain('third-fr')
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

  it('deals only curated icon landmarks on easy, never a swept heritage site', async () => {
    process.env.FORCE_ROUND_TYPE = 'pin-landmark'
    const icons = new Set(dealableLandmarks('easy').map(([slug]) => slug))
    for (let deal = 0; deal < 15; deal++) {
      const dealt = (await getRoundChallenge({ game: game('easy') })) as PinLandmarkChallenge
      expect(icons.has(dealt.slug)).toBe(true)
      expect(PLACES[dealt.slug]?.curated, dealt.slug).toBeDefined()
    }
  })
})

// --- The one roster --------------------------------------------------------------

describe('PLACES', () => {
  it('gives every place at least one facet', () => {
    for (const [slug, place] of Object.entries(PLACES)) {
      expect(place.curated ?? place.unesco, `${slug} belongs to no roster`).toBeDefined()
    }
    expect(curatedPlaces().length).toBeGreaterThan(300)
    expect(heritagePlaces().length).toBeGreaterThan(300)
  })

  it('holds a subject on both rosters as ONE entry carrying both facets', () => {
    // The split datasets stored these twice, each half-populated, with two
    // photos of the same place. Ha Long Bay is the canonical example.
    const both = Object.values(PLACES).filter(place => place.curated && place.unesco)
    expect(both.length).toBeGreaterThan(50)
    expect(PLACES['ha-long-bay']?.curated).toBeDefined()
    expect(PLACES['ha-long-bay']?.unesco).toBeDefined()
  })

  it('takes the UNION of what both selections knew, never a winner per field', () => {
    // The merge used to keep the curated prose and drop the register's
    // one-liner for all 60 shared subjects. Both are kept now: they are
    // different registers of fact, and one is all we have for a place the
    // curated roster never wrote up.
    const shared = Object.values(PLACES).filter(place => place.curated && place.unesco)
    expect(shared.filter(place => place.description && place.summary).length).toBe(shared.length)

    // Coverage can only improve: the curated pass never used to ask Wikidata
    // for a description at all, so the handful still silent are places neither
    // the facts file nor the register wrote up. Seven today, and the next
    // generator run fetches summaries for the curated roster too.
    const withText = Object.values(PLACES).filter(
      place => place.description ?? place.summary
    ).length
    expect(withText).toBeGreaterThanOrEqual(726)
  })

  it('prefers the register point where the two sources disagree', () => {
    // A curated Q-id often resolves to the municipality around a site rather
    // than the site; the inscribed coordinate is the site's own. That gap put
    // Copan's pin answer 40km from the ruins and Palenque's 27km from theirs.
    expect(PLACES['copan']?.coordinates).toEqual({ lat: 14.838, lng: -89.1424 })
    expect(PLACES['palenque']?.coordinates).toEqual({ lat: 17.4842, lng: -92.0464 })
  })

  it('ranks fame per facet, so each roster keeps its own country icon', () => {
    // "France's best-known landmark" and "France's best-known World Heritage
    // site" are different questions — flattening them to one tier per place
    // would strand a country with no dealable site at easy. So every country
    // present in a roster must own an icon IN that roster.
    for (const [name, roster, fameOf] of [
      ['curated', curatedPlaces(), (place: CuratedPlace) => place.curated.fame],
      ['unesco', heritagePlaces(), (place: HeritagePlace) => place.unesco.fame],
    ] as const) {
      const countries = new Set<ISOCountryCode>()
      const majors = new Set<ISOCountryCode>()
      for (const [, place] of roster) {
        countries.add(place.country)
        // @ts-expect-error — each row pairs its own roster with its own reader.
        if (fameOf(place) === 'major') majors.add(place.country)
      }
      for (const country of countries) {
        expect(majors.has(country), `${name}/${country} has no icon`).toBe(true)
      }
      expect(majors.size, name).toBeGreaterThanOrEqual(3)
    }
  })

  it('tiers each country icon major, so the easy tier deals the famous ones', () => {
    const slugs = dealableLandmarks('easy').map(([slug]) => slug)
    expect(slugs).toContain('eiffel-tower')
    expect(slugs).toContain('taj-mahal')
    expect(slugs).toContain('statue-of-liberty')
    expect(slugs).toContain('great-wall-of-china')

    // What the dealer actually draws from: icons that can carry a pin. One per
    // country — a country may hold a second icon only where a seed override
    // covers an entry the generator could not place (Bosnia's Kravice Falls
    // resolved no point, so Stari Most is pinned major alongside it).
    const pinnable = dealableLandmarks('easy')
      .filter(([, place]) => place.coordinates)
      .map(([, place]) => place.country)
    expect(new Set(pinnable).size).toBe(pinnable.length)
  })

  it('leaves Heritage Hunt three distinct countries to deal at every difficulty', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const countries = new Set(dealableHeritage(difficulty).map(([, site]) => site.country))
      expect(countries.size, difficulty).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps one photo per slug, with no orphans and nothing dangling', () => {
    const referenced = new Set(
      Object.values(PLACES).map(place => place.image.replace('/landmarks/', ''))
    )
    for (const place of Object.values(PLACES)) {
      expect(place.image, place.name).toMatch(/^\/landmarks\//)
      expect(existsSync(`public${place.image}`), place.image).toBe(true)
    }
    for (const file of readdirSync('public/landmarks')) {
      expect(referenced.has(file), `${file} is on disk but no place points at it`).toBe(true)
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
    expect([...byHash.values()].filter(files => files.length > 1).map(f => f.join(' = '))).toEqual(
      []
    )
  })
})
