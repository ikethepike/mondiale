import { describe, expect, it } from 'vitest'
import { BORDERS } from '~~/data/borders.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { isLargeCountry } from '~~/lib/country'
import { type OutlinePoint, resampleOpen } from '~~/lib/outline'
import type { BoundaryChallenge, MinChallenge } from '~~/types/challenges/final-challenge.type'
import type { Game, GameDifficulty } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import {
  BOUNDARY_TOLERANCE,
  boundaryScene,
  dealReplacementChallenge,
  GAUNTLET_LIVES,
  getFinalChallenges,
  isBoundaryDrawnWithin,
  isCorrectFinalAnswer,
  MADE_COMMODITIES,
} from './final-challenge'

const gameFor = (variant: Game['variant'], difficulty: GameDifficulty) =>
  ({ variant, difficulty }) as Game

const isMember = (isoCode: string, organization: string) =>
  COUNTRIES[isoCode as keyof typeof COUNTRIES].membership.some(entry => entry.id === organization)

const DEAL_ROUNDS = 200

describe('getFinalChallenges', () => {
  it('deals the difficulty-scaled length, lives and progress fields', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const gauntlet = getFinalChallenges({ game: gameFor('world', difficulty) })
      expect(gauntlet.lives).toBe(GAUNTLET_LIVES[difficulty])
      expect(gauntlet.totalCount).toBe(gauntlet.challenges.length)
      expect(gauntlet.answeredCorrect).toBe(0)
      expect(gauntlet.challenges.length).toBeGreaterThan(0)
      expect(gauntlet.challenges.length).toBeLessThanOrEqual(
        { easy: 2, normal: 3, hard: 5 }[difficulty]
      )
    }
  })

  it('never repeats a challenge type within a run', () => {
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const { challenges } = getFinalChallenges({ game: gameFor('world', 'hard') })
      const types = challenges.map(challenge => challenge._type)
      expect(new Set(types).size).toBe(types.length)
    }
  })

  it('anchors the sunset finale last when drawn', () => {
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const { challenges } = getFinalChallenges({ game: gameFor('world', 'hard') })
      const sunsetIndex = challenges.findIndex(c => c._type === 'sunset-blitz-challenge')
      if (sunsetIndex >= 0) expect(sunsetIndex).toBe(challenges.length - 1)
    }
  })

  it('keeps region questions off continental boards and heavy modes off easy runs', () => {
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const europe = getFinalChallenges({ game: gameFor('europe', 'hard') })
      expect(europe.challenges.some(c => c._type === 'region-challenge')).toBe(false)

      const easy = getFinalChallenges({ game: gameFor('world', 'easy') })
      for (const challenge of easy.challenges) {
        expect([
          'membership-challenge',
          'scales-challenge',
          'sunset-blitz-challenge',
        ]).not.toContain(challenge._type)
      }
    }
  })
})

describe('membership challenge', () => {
  // The "Germany is not in the EU" regression: the dealt exception must be a
  // genuine non-member, on every board
  it('never names a member as the exception', () => {
    for (const variant of ['world', 'europe'] as const) {
      for (let round = 0; round < DEAL_ROUNDS; round++) {
        const { challenges } = getFinalChallenges({ game: gameFor(variant, 'hard') })
        for (const challenge of challenges) {
          if (challenge._type !== 'membership-challenge') continue
          expect(isMember(challenge.exception, challenge.organization)).toBe(false)
        }
      }
    }
  })

  // The Liechtenstein/OPEC giveaway: orgs without a real footprint on the
  // board never deal
  it('only offers organizations with members and non-members on the board', () => {
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const { challenges } = getFinalChallenges({ game: gameFor('europe', 'hard') })
      for (const challenge of challenges) {
        if (challenge._type !== 'membership-challenge') continue
        expect(['opec', 'au', 'csto']).not.toContain(challenge.organization)
      }
    }
  })
})

describe('scales challenge', () => {
  it('always deals a solvable balance', () => {
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const { challenges } = getFinalChallenges({ game: gameFor('world', 'hard') })
      for (const challenge of challenges) {
        if (challenge._type !== 'scales-challenge') continue
        expect(challenge.tolerance).toBeGreaterThan(0)
        expect(challenge.maxPicks).toBeGreaterThanOrEqual(2)
      }
    }
  })
})

describe('sunset blitz challenge', () => {
  it('deals a dense window with a reachable quota', () => {
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const { challenges } = getFinalChallenges({ game: gameFor('world', 'hard') })
      for (const challenge of challenges) {
        if (challenge._type !== 'sunset-blitz-challenge') continue
        expect(challenge.countries.length).toBeGreaterThanOrEqual(8)
        expect(challenge.quotaRatio).toBeGreaterThan(0)
        expect(challenge.quotaRatio).toBeLessThanOrEqual(1)
        expect(challenge.durationSeconds).toBeGreaterThan(0)
        expect(new Set(challenge.countries).size).toBe(challenge.countries.length)
      }
    }
  })

  // Regression: a cluster hopping through giant countries once widened into
  // an 80-country whole-world "window" with a quota of 28
  it('never deals a window bigger than a region', () => {
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const { challenges } = getFinalChallenges({ game: gameFor('world', 'hard') })
      for (const challenge of challenges) {
        if (challenge._type !== 'sunset-blitz-challenge') continue
        expect(challenge.countries.length).toBeLessThanOrEqual(16)
      }
    }
  })
})

describe('city nocturne challenge', () => {
  it('deals only countries with enough cities and a reachable quota', () => {
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const { challenges } = getFinalChallenges({ game: gameFor('world', 'hard') })
      for (const challenge of challenges) {
        if (challenge._type !== 'city-nocturne-challenge') continue
        expect(challenge.cityCount).toBeGreaterThanOrEqual(6)
        expect(challenge.quota).toBeLessThanOrEqual(challenge.cityCount)
        expect(challenge.quota).toBeGreaterThan(0)
      }
    }
  })
})

describe('boundary challenge', () => {
  const challengeFor = (
    countries: [ISOCountryCode, ISOCountryCode],
    difficulty: GameDifficulty
  ): BoundaryChallenge => ({
    _type: 'boundary-challenge',
    countries,
    tolerance: BOUNDARY_TOLERANCE[difficulty],
  })

  /** Deterministic pseudo-noise — tests must not roll dice. */
  const noise = (seed: number): number => {
    const value = Math.sin(seed * 12.9898) * 43758.5453
    return (value - Math.floor(value)) * 2 - 1
  }

  /**
   * A deterministic stand-in for a real drawn line over the true border.
   * A TOUCHPAD line tracks faithfully but carries high-frequency jitter (pad
   * quantization) and a small drift. A PHONE finger comes out heavily
   * smoothed by the touch pipeline, wobbles wider, drifts more and stops
   * short of the coasts. RUSHED is the sloppy-but-right corridor sweep.
   * Amplitudes are fractions of the pair frame's span — how big the error
   * looks on the screen the player actually drew on.
   */
  const drawnLine = (
    target: OutlinePoint[],
    span: number,
    quality: { smooth: number; jitter: number; wobble: number; drift: number; trim: number }
  ): [number, number][] => {
    let points = resampleOpen(target, 44)
    for (let pass = 0; pass < quality.smooth; pass++) {
      points = points.map((point, index) => {
        if (index === 0 || index === points.length - 1) return point
        return [
          (points[index - 1][0] + point[0] + points[index + 1][0]) / 3,
          (points[index - 1][1] + point[1] + points[index + 1][1]) / 3,
        ]
      })
    }
    const cut = Math.floor(points.length * quality.trim)
    points = points.slice(cut, points.length - cut)
    const count = points.length
    return points.map(([x, y], index) => {
      const t = index / count
      return [
        x +
          (Math.sin(t * Math.PI * 2.3 + 0.7) * quality.wobble +
            noise(index) * quality.jitter +
            quality.drift) *
            span,
        y +
          (Math.cos(t * Math.PI * 3.1) * quality.wobble +
            noise(index + 100) * quality.jitter +
            quality.drift * 0.6) *
            span,
      ]
    })
  }

  const TOUCHPAD = { smooth: 1, jitter: 0.004, wobble: 0.01, drift: 0.008, trim: 0.03 }
  const PHONE = { smooth: 4, jitter: 0.002, wobble: 0.022, drift: 0.014, trim: 0.08 }
  const RUSHED = { smooth: 6, jitter: 0.003, wobble: 0.04, drift: 0.028, trim: 0.1 }

  const PAIRS: [ISOCountryCode, ISOCountryCode][] = [
    ['FR', 'ES'],
    ['KZ', 'UZ'],
    ['NO', 'SE'],
    ['IN', 'PK'],
    ['US', 'CA'],
    ['DE', 'PL'],
  ]

  it('deals adjacent, drawable pairs with the difficulty tolerance', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (let round = 0; round < DEAL_ROUNDS; round++) {
        const { challenges } = getFinalChallenges({ game: gameFor('world', difficulty) })
        for (const challenge of challenges) {
          if (challenge._type !== 'boundary-challenge') continue
          const [a, b] = challenge.countries
          expect(BORDERS[a]).toContain(b)
          expect(challenge.tolerance).toBe(BOUNDARY_TOLERANCE[difficulty])
          expect(boundaryScene(challenge.countries)).toBeDefined()
        }
      }
    }
  })

  it('keeps easy runs between map-findable landmasses', () => {
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const { challenges } = getFinalChallenges({ game: gameFor('world', 'easy') })
      for (const challenge of challenges) {
        if (challenge._type !== 'boundary-challenge') continue
        expect(challenge.countries.every(isLargeCountry)).toBe(true)
      }
    }
  })

  it('passes an honest touchpad line at every difficulty', () => {
    for (const pair of PAIRS) {
      const scene = boundaryScene(pair)!
      const line = drawnLine(scene.line, scene.span, TOUCHPAD)
      for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        expect(
          isBoundaryDrawnWithin(challengeFor(pair, difficulty), line),
          `${pair.join('-')} ${difficulty}`
        ).toBe(true)
      }
    }
  })

  it('passes an honest phone-finger line at every difficulty', () => {
    for (const pair of PAIRS) {
      const scene = boundaryScene(pair)!
      const line = drawnLine(scene.line, scene.span, PHONE)
      for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        expect(
          isBoundaryDrawnWithin(challengeFor(pair, difficulty), line),
          `${pair.join('-')} ${difficulty}`
        ).toBe(true)
      }
    }
  })

  it('judges a rushed corridor sweep by difficulty: easy forgives, hard does not', () => {
    for (const pair of PAIRS) {
      const scene = boundaryScene(pair)!
      const line = drawnLine(scene.line, scene.span, RUSHED)
      expect(isBoundaryDrawnWithin(challengeFor(pair, 'easy'), line), pair.join('-')).toBe(true)
    }
    // On a short straight border (Germany–Poland) a rushed sweep and an honest
    // line are the same thing — hard's strictness shows on the wiggly ones
    for (const pair of PAIRS.filter(([a]) => !['FR', 'DE'].includes(a))) {
      const scene = boundaryScene(pair)!
      const line = drawnLine(scene.line, scene.span, RUSHED)
      expect(isBoundaryDrawnWithin(challengeFor(pair, 'hard'), line), pair.join('-')).toBe(false)
    }
  })

  it('accepts the line drawn in either direction', () => {
    const scene = boundaryScene(['FR', 'ES'])!
    const line = drawnLine(scene.line, scene.span, PHONE).reverse()
    expect(isBoundaryDrawnWithin(challengeFor(['FR', 'ES'], 'hard'), line)).toBe(true)
  })

  it('fails a line drawn through the blob in the wrong place', () => {
    for (const pair of PAIRS) {
      const scene = boundaryScene(pair)!
      const [x, y, width, height] = scene.frame
      // The frame diagonal: confidently long, confidently wrong
      const diagonal: [number, number][] = Array.from({ length: 24 }, (_, index) => [
        x + (width * index) / 23,
        y + (height * index) / 23,
      ])
      for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        expect(
          isBoundaryDrawnWithin(challengeFor(pair, difficulty), diagonal),
          `${pair.join('-')} ${difficulty}`
        ).toBe(false)
      }
    }
  })

  it('fails the true line shifted an eighth of the frame off', () => {
    for (const pair of PAIRS) {
      const scene = boundaryScene(pair)!
      const shifted = scene.line.map(([x, y]): [number, number] => [
        x + scene.span * 0.12,
        y + scene.span * 0.06,
      ])
      expect(isBoundaryDrawnWithin(challengeFor(pair, 'easy'), shifted), pair.join('-')).toBe(false)
    }
  })

  it('fails a token stub on the coverage gate even when it sits on the line', () => {
    for (const pair of PAIRS) {
      const scene = boundaryScene(pair)!
      const stub = resampleOpen(scene.line, 48).slice(0, 8) as [number, number][]
      expect(isBoundaryDrawnWithin(challengeFor(pair, 'easy'), stub), pair.join('-')).toBe(false)
    }
  })

  it('fails a coastline tracing — near the blob, not the border', () => {
    for (const pair of PAIRS) {
      const scene = boundaryScene(pair)!
      const coast = scene.coasts.reduce((longest, run) =>
        run.length > longest.length ? run : longest
      ) as [number, number][]
      for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        expect(
          isBoundaryDrawnWithin(challengeFor(pair, difficulty), coast),
          `${pair.join('-')} ${difficulty}`
        ).toBe(false)
      }
    }
  })

  it('fails garbage without throwing; only a shape mismatch throws', () => {
    const challenge = challengeFor(['FR', 'ES'], 'easy')
    expect(isBoundaryDrawnWithin(challenge, [])).toBe(false)
    expect(isBoundaryDrawnWithin(challenge, [[NaN, 2] as [number, number]])).toBe(false)
    expect(
      isCorrectFinalAnswer({
        challenge,
        submittedAnswer: { _type: 'boundary-challenge', drawn: [] },
        pool: Object.keys(COUNTRIES) as ISOCountryCode[],
      })
    ).toBe(false)
    expect(() =>
      isCorrectFinalAnswer({
        challenge,
        submittedAnswer: { _type: 'region-challenge', region: 'europe' },
        pool: Object.keys(COUNTRIES) as ISOCountryCode[],
      })
    ).toThrow(TypeError)
  })

  it('resolves the same scene for either country order', () => {
    const dealt = boundaryScene(['FR', 'ES'])!
    const flipped = boundaryScene(['ES', 'FR'])!
    expect(dealt.span).toBe(flipped.span)
    expect(dealt.line.length).toBe(flipped.line.length)
    expect(dealt.rings[0]).toEqual(flipped.rings[1])
  })

  it('refuses pairs that never touch or barely touch', () => {
    expect(boundaryScene(['FR', 'JP'])).toBeUndefined()
    expect(boundaryScene(['ES', 'DE'])).toBeUndefined()
  })
})

describe('dealReplacementChallenge', () => {
  it('avoids the excluded type when an alternative exists', () => {
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const replacement = dealReplacementChallenge({
        game: gameFor('world', 'hard'),
        exclude: ['membership-challenge'],
      })
      expect(replacement).toBeDefined()
      expect(replacement?._type).not.toBe('membership-challenge')
    }
  })
})

describe('isCorrectFinalAnswer', () => {
  const pool = Object.keys(COUNTRIES) as (keyof typeof COUNTRIES)[]

  it('accepts any country tied at the dealt extreme on min/max questions', () => {
    // Real tie in the dataset: several countries host the same smallest
    // refugee count — every one of them is a right answer.
    const values = pool
      .map(isoCode => ({ isoCode, amount: COUNTRIES[isoCode].humanRights?.refugees?.amount }))
      .filter(entry => entry.amount !== undefined)
      .sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0))
    const minimum = values[0]
    const tied = values.filter(entry => entry.amount === minimum.amount)

    const challenge: MinChallenge = {
      _type: 'min-challenge',
      accessorId: 'humanRights.refugees',
      country: tied[0].isoCode,
      hints: [],
    }
    for (const entry of tied) {
      expect(
        isCorrectFinalAnswer({
          challenge,
          submittedAnswer: { _type: 'min-challenge', isoCode: entry.isoCode },
          pool,
        })
      ).toBe(true)
    }
    expect(
      isCorrectFinalAnswer({
        challenge,
        submittedAnswer: { _type: 'min-challenge', isoCode: values[values.length - 1].isoCode },
        pool,
      })
    ).toBe(false)
  })

  it('accepts any speaker on language questions', () => {
    const challenge = { _type: 'language-challenge', language: 'French' } as const
    const speakers = pool.filter(isoCode => COUNTRIES[isoCode].languages.includes('French'))
    expect(speakers.length).toBeGreaterThan(1)
    for (const isoCode of speakers.slice(0, 5)) {
      expect(
        isCorrectFinalAnswer({
          challenge,
          submittedAnswer: { _type: 'language-challenge', isoCode },
          pool,
        })
      ).toBe(true)
    }
    const nonSpeaker = pool.find(isoCode => !COUNTRIES[isoCode].languages.includes('French'))!
    expect(
      isCorrectFinalAnswer({
        challenge,
        submittedAnswer: { _type: 'language-challenge', isoCode: nonSpeaker },
        pool,
      })
    ).toBe(false)
  })

  it('stays strict on leadership questions and throws on shape mismatches', () => {
    const challenge = { _type: 'leadership-challenge', country: 'SE' } as const
    expect(
      isCorrectFinalAnswer({
        challenge,
        submittedAnswer: { _type: 'leadership-challenge', isoCode: 'SE' },
        pool,
      })
    ).toBe(true)
    expect(
      isCorrectFinalAnswer({
        challenge,
        submittedAnswer: { _type: 'leadership-challenge', isoCode: 'NO' },
        pool,
      })
    ).toBe(false)
    expect(() =>
      isCorrectFinalAnswer({
        challenge,
        submittedAnswer: { _type: 'region-challenge', region: 'europe' },
        pool,
      })
    ).toThrow(TypeError)
  })
})

describe('MADE_COMMODITIES', () => {
  it('curates only commodities the data still ships', () => {
    const shipped = new Set(
      Object.values(COUNTRIES).flatMap(country => country.economics.exports ?? [])
    )
    for (const commodity of MADE_COMMODITIES) expect(shipped).toContain(commodity)
  })

  it('deals only curated commodities', () => {
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const { challenges } = getFinalChallenges({ game: gameFor('world', 'hard') })
      for (const challenge of challenges) {
        if (challenge._type === 'made-challenge')
          expect(MADE_COMMODITIES.has(challenge.commodity)).toBe(true)
      }
    }
  })
})
