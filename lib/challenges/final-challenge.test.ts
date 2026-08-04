import { describe, expect, it } from 'vitest'
import { BORDERS } from '~~/data/borders.gen'
import { CHANGES } from '~~/data/changes.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { EVENTS } from '~~/data/events.gen'
import { TREATIES } from '~~/data/treaties.gen'
import type { EventEntry } from '~~/generators/create-events-file'
import { countryEndonym, isLargeCountry, mentionsCountry } from '~~/lib/country'
import { playableCountries } from '~~/lib/game-rules'
import { type OutlinePoint, resampleOpen } from '~~/lib/outline'
import type {
  BoundaryChallenge,
  ChangeChallenge,
  DiasporaChallenge,
  EndonymChallenge,
  MinChallenge,
  YearbookChallenge,
} from '~~/types/challenges/final-challenge.type'
import { MIN_STORED_EXPORTERS } from '~~/generators/data/commodity-hs-codes'
import type { Game, GameDifficulty } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import {
  BORDER_STORIES,
  BOUNDARY_TOLERANCE,
  boundaryScene,
  boundaryStory,
  CHANGE_TUNING,
  changeAccepted,
  changeDecade,
  dealReplacementChallenge,
  decisiveOrigins,
  exportsCommodity,
  GAUNTLET_LIVES,
  hasObviousDestination,
  getFinalChallenges,
  isBoundaryDrawnWithin,
  isCorrectFinalAnswer,
  isTransparentEndonym,
  leaksYear,
  MADE_COMMODITIES,
  madeAcceptedCountries,
  madeTopExporters,
  YEARBOOK_TUNING,
  yearbookLeaksYear,
  yearbookYear,
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
          'treaty-challenge',
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

describe('treaty challenge', () => {
  // The mirror of the membership regression: the holdout must genuinely not be
  // bound, or the question has no answer.
  it('never names a party as the holdout', () => {
    for (const variant of ['world', 'europe'] as const) {
      for (let round = 0; round < DEAL_ROUNDS; round++) {
        const { challenges } = getFinalChallenges({ game: gameFor(variant, 'hard') })
        for (const challenge of challenges) {
          if (challenge._type !== 'treaty-challenge') continue
          expect(TREATIES[challenge.treaty]?.[challenge.holdout]?.standing).not.toBe('party')
        }
      }
    }
  })

  // standing drives the reveal's wording, so a mismatch would have the lesson
  // state something the data does not say.
  it('records a standing the data agrees with', () => {
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const { challenges } = getFinalChallenges({ game: gameFor('world', 'hard') })
      for (const challenge of challenges) {
        if (challenge._type !== 'treaty-challenge') continue
        const recorded = TREATIES[challenge.treaty]?.[challenge.holdout]?.standing
        expect(challenge.standing).toBe(recorded ?? 'absent')
      }
    }
  })

  // The point of the mode: a country that signed and stalled, or walked out,
  // is the question worth asking. Without the bias those holdouts are a
  // rounding error against ~160 countries that simply never joined.
  it('prefers a holdout that made a choice', () => {
    let pointed = 0
    let dealt = 0
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const { challenges } = getFinalChallenges({ game: gameFor('world', 'hard') })
      for (const challenge of challenges) {
        if (challenge._type !== 'treaty-challenge') continue
        dealt++
        if (challenge.standing !== 'absent') pointed++
      }
    }
    expect(dealt).toBeGreaterThan(0)
    expect(pointed / dealt).toBeGreaterThan(0.8)
  })

  // The United States is the only country on earth that signed the Convention
  // on the Rights of the Child and never ratified it — so on any board holding
  // it, the CRC has exactly one legal answer.
  //
  // Asserting the deal COUNT matters: an earlier eligibility gate demanded four
  // unbound countries, and the CRC has three, so it was never dealt at all and
  // this test passed by never entering its loop.
  it('deals the CRC, and names the United States when it does', () => {
    let dealt = 0
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const { challenges } = getFinalChallenges({ game: gameFor('world', 'hard') })
      for (const challenge of challenges) {
        if (challenge._type !== 'treaty-challenge' || challenge.treaty !== 'crc') continue
        dealt++
        expect(challenge.holdout).toBe('US')
        expect(challenge.standing).toBe('signatory')
      }
    }
    expect(dealt).toBeGreaterThan(0)
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

  // Like MADE_COMMODITIES: curated copy must not drift from the data. A typo
  // or unsorted key would silently never surface on any reveal.
  it('tells stories only about real, drawable, correctly-keyed borders', () => {
    for (const storyKey of Object.keys(BORDER_STORIES)) {
      const [a, b] = storyKey.split('|') as [ISOCountryCode, ISOCountryCode]
      expect([a, b].sort().join('|'), storyKey).toBe(storyKey)
      expect(BORDERS[a], storyKey).toContain(b)
      expect(boundaryScene([a, b]), storyKey).toBeDefined()
      expect(boundaryStory([b, a]), storyKey).toBe(BORDER_STORIES[storyKey])
    }
  })
})

describe('endonym challenge', () => {
  it('deals distinct countries with real endonyms and an absorbable miss', () => {
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const { challenges } = getFinalChallenges({ game: gameFor('world', 'hard') })
      for (const challenge of challenges) {
        if (challenge._type !== 'endonym-challenge') continue
        expect(challenge.quota).toBe(4)
        expect(challenge.countries.length).toBeLessThanOrEqual(5)
        expect(challenge.countries.length).toBeGreaterThan(challenge.quota)
        expect(new Set(challenge.countries).size).toBe(challenge.countries.length)
        for (const isoCode of challenge.countries) {
          expect(countryEndonym(isoCode)).toBeDefined()
        }
      }
    }
  })

  it('keeps easy decks transparent with a quota of 2', () => {
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const { challenges } = getFinalChallenges({ game: gameFor('world', 'easy') })
      for (const challenge of challenges) {
        if (challenge._type !== 'endonym-challenge') continue
        expect(challenge.quota).toBe(2)
        for (const isoCode of challenge.countries) {
          expect(isTransparentEndonym(isoCode)).toBe(true)
        }
      }
    }
  })

  it('never deals on boards without enough endonyms (South America)', () => {
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const { challenges } = getFinalChallenges({ game: gameFor('south-america', 'hard') })
      expect(challenges.some(challenge => challenge._type === 'endonym-challenge')).toBe(false)
    }
  })

  it('sorts the issue’s poster names into the intended tiers', () => {
    // Guessable from the English name…
    for (const isoCode of ['DK', 'IT', 'HR', 'BE'] as const) {
      expect(isTransparentEndonym(isoCode)).toBe(true)
    }
    // …and the real test
    for (const isoCode of ['EG', 'FI', 'CN', 'AL', 'AM', 'DE'] as const) {
      expect(isTransparentEndonym(isoCode)).toBe(false)
    }
  })
})

describe('change challenge', () => {
  const dealtChanges = (difficulty: GameDifficulty, rounds = DEAL_ROUNDS) => {
    const dealt: ChangeChallenge[] = []
    for (let round = 0; round < rounds; round++) {
      for (const challenge of getFinalChallenges({ game: gameFor('world', difficulty) })
        .challenges) {
        if (challenge._type === 'change-challenge') dealt.push(challenge)
      }
    }
    return dealt
  }

  it('deals two real frames and the difficulty tuning', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const dealt = dealtChanges(difficulty)
      expect(dealt.length, difficulty).toBeGreaterThan(0)
      const tuning = CHANGE_TUNING[difficulty]
      for (const challenge of dealt) {
        expect(CHANGES[challenge.slug]).toBeDefined()
        expect(challenge.frames).toHaveLength(2)
        expect(challenge.frames[0]).not.toBe(challenge.frames[1])
        expect(challenge.crossfadeSeconds).toBe(tuning.crossfadeSeconds)
        expect(challenge.decadeTolerance).toBe(tuning.decadeTolerance)
        // The years are the strongest hint on offer: easy and normal wear
        // them, hard reads the picture alone
        expect(Boolean(challenge.frameYears)).toBe(tuning.showYears)
        // The answer never rides the snapshot
        expect(JSON.stringify(challenge)).not.toContain('countries')
      }
    }
  })

  it('accepts every country holding the subject, and neighbours only on easy', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (const challenge of dealtChanges(difficulty, 40)) {
        const held = CHANGES[challenge.slug].countries
        const accepted = changeAccepted(challenge)
        for (const iso of held) expect(accepted).toContain(iso)
        if (difficulty === 'easy') expect(accepted.length).toBeGreaterThanOrEqual(held.length)
        else expect(accepted).toHaveLength(held.length)
      }
    }
  })

  it('grades the tap against the accepted set', () => {
    const [challenge] = dealtChanges('normal', 40)
    const pool = playableCountries(gameFor('world', 'normal'))
    const accepted = changeAccepted(challenge)
    const wrong = pool.find(iso => !accepted.includes(iso))!

    expect(
      isCorrectFinalAnswer({
        challenge,
        submittedAnswer: { _type: 'change-challenge', isoCode: accepted[0] },
        pool,
      })
    ).toBe(true)
    expect(
      isCorrectFinalAnswer({
        challenge,
        submittedAnswer: { _type: 'change-challenge', isoCode: wrong },
        pool,
      })
    ).toBe(false)
  })

  it('needs both halves where the decade is asked, and never throws on a missing dial', () => {
    const [challenge] = dealtChanges('hard', 40)
    const pool = playableCountries(gameFor('world', 'hard'))
    const isoCode = changeAccepted(challenge)[0]
    const decade = changeDecade(challenge)!
    const grade = (answer: { isoCode: ISOCountryCode; decade?: number }) =>
      isCorrectFinalAnswer({
        challenge,
        submittedAnswer: { _type: 'change-challenge', ...answer },
        pool,
      })

    expect(grade({ isoCode, decade })).toBe(true)
    expect(grade({ isoCode, decade: decade + challenge.decadeTolerance! })).toBe(true)
    expect(grade({ isoCode, decade: decade + challenge.decadeTolerance! + 10 })).toBe(false)
    // A right place with no decade is a wrong answer, not a malformed one
    expect(grade({ isoCode })).toBe(false)
    expect(grade({ isoCode, decade: Number.NaN })).toBe(false)
  })

  // `if (!decadeTolerance)` read "must be exact" and "don't ask" the same way,
  // so a zero-tolerance round would have passed every tap on its own.
  it('reads a zero decade tolerance as exact, not as absent', () => {
    const [dealt] = dealtChanges('hard', 40)
    const challenge: ChangeChallenge = { ...dealt, decadeTolerance: 0 }
    const pool = playableCountries(gameFor('world', 'hard'))
    const isoCode = changeAccepted(challenge)[0]
    const grade = (decade?: number) =>
      isCorrectFinalAnswer({
        challenge,
        submittedAnswer: { _type: 'change-challenge', isoCode, decade },
        pool,
      })

    expect(grade(changeDecade(challenge)!)).toBe(true)
    expect(grade(changeDecade(challenge)! + 10)).toBe(false)
    expect(grade(undefined)).toBe(false)
  })

  it('throws only on a mismatched answer shape', () => {
    const [challenge] = dealtChanges('normal', 40)
    expect(() =>
      isCorrectFinalAnswer({
        challenge,
        submittedAnswer: { _type: 'region-challenge', region: 'europe' },
        pool: playableCountries(gameFor('world', 'normal')),
      })
    ).toThrow(TypeError)
  })

  it('never deals a story that names its own country, or its decade on hard', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (const challenge of dealtChanges(difficulty, 40)) {
        const story = CHANGES[challenge.slug]
        for (const iso of story.countries) {
          expect(mentionsCountry(story.name, iso), `${challenge.slug} names ${iso}`).toBe(false)
        }
        if (!challenge.decadeTolerance) continue
        expect(
          leaksYear(story.startYear, challenge.slug, story.name, story.description),
          challenge.slug
        ).toBe(false)
      }
    }
  })

  // The stage stacks the frames, so a pair that disagrees on shape jump-cuts
  // rather than fades. The generator gates on this; asserting it here catches a
  // hand-edited data file too.
  it('ships frames that can actually crossfade', () => {
    for (const [slug, story] of Object.entries(CHANGES)) {
      const [before, after] = story.frames
      expect(before.image, slug).not.toBe(after.image)
      expect(before.year, slug).toBeLessThan(after.year)
    }
  })

  // A curated deck drifts: this catches a seed file that has quietly become a
  // single region's story, or a story whose frames fell off disk.
  it('keeps the shipped deck honest — two frames each, no region past a third', () => {
    const stories = Object.entries(CHANGES)
    expect(stories.length).toBeGreaterThanOrEqual(5)
    const perRegion = new Map<string, number>()
    for (const [slug, story] of stories) {
      expect(story.frames, slug).toHaveLength(2)
      expect(story.countries.length, slug).toBeGreaterThan(0)
      expect(story.startYear, slug).toBeGreaterThan(1900)
      const region = COUNTRIES[story.countries[0]]?.region
      if (region) perRegion.set(region, (perRegion.get(region) ?? 0) + 1)
    }
    for (const [region, count] of perRegion) {
      expect(count / stories.length, region).toBeLessThanOrEqual(0.5)
    }
  })
})

describe('yearbook challenge', () => {
  // Density guard: every dealt page fills its difficulty's headline count
  // from ONE year — a mixed-year page would have no single answer
  it('deals a full page of same-year headlines at the difficulty density', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (let round = 0; round < DEAL_ROUNDS; round++) {
        const { challenges } = getFinalChallenges({ game: gameFor('world', difficulty) })
        for (const challenge of challenges) {
          if (challenge._type !== 'yearbook-challenge') continue
          const tuning = YEARBOOK_TUNING[difficulty]
          expect(challenge.headlines.length).toBe(tuning.headlineCount)
          expect(challenge.tolerance).toBe(tuning.tolerance)
          expect(new Set(challenge.headlines).size).toBe(challenge.headlines.length)
          const years = new Set(challenge.headlines.map(slug => EVENTS[slug]?.year))
          expect(years.size).toBe(1)
          expect(yearbookYear(challenge)).toBeDefined()
        }
      }
    }
  })

  it('never deals a headline whose slug, name or description surfaces the year', () => {
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const { challenges } = getFinalChallenges({ game: gameFor('world', 'hard') })
      for (const challenge of challenges) {
        if (challenge._type !== 'yearbook-challenge') continue
        for (const slug of challenge.headlines) {
          expect(yearbookLeaksYear(slug, EVENTS[slug])).toBe(false)
        }
      }
    }
  })

  it('flags leaks in slugs, names, near-year mentions and BCE spellings', () => {
    const event = (overrides: Partial<EventEntry>): EventEntry => ({
      name: 'A quiet treaty',
      country: 'DE',
      kind: 'politics',
      year: 1946,
      description: 'Signed without ceremony.',
      ...overrides,
    })
    // The slug travels the wire and names the card image — it leaks too
    expect(yearbookLeaksYear('treaty-of-manila-1946', event({}))).toBe(true)
    expect(yearbookLeaksYear('a-treaty', event({ name: 'Revolutions of 1848', year: 1848 }))).toBe(
      true
    )
    // A neighbouring year inside the tolerance window dates the page as well
    expect(yearbookLeaksYear('a-treaty', event({ description: 'Ratified early in 1947.' }))).toBe(
      true
    )
    expect(
      yearbookLeaksYear('a-battle', event({ year: -490, description: 'Fought in 490 BCE.' }))
    ).toBe(true)
    // Unrelated numbers are not years
    expect(
      yearbookLeaksYear(
        'battle-of-marathon',
        event({ year: -490, description: 'The modern 42-kilometre race is named for it.' })
      )
    ).toBe(false)
    expect(yearbookLeaksYear('a-treaty', event({}))).toBe(false)
  })

  it('accepts a dialed year within tolerance and rejects outside it', () => {
    const slug = Object.keys(EVENTS)[0]
    const challenge: YearbookChallenge = {
      _type: 'yearbook-challenge',
      headlines: [slug],
      tolerance: 2,
      secondsPerHeadline: 16,
    }
    const year = EVENTS[slug].year
    const pool = Object.keys(COUNTRIES) as (keyof typeof COUNTRIES)[]
    for (const offset of [-2, -1, 0, 1, 2]) {
      expect(
        isCorrectFinalAnswer({
          challenge,
          submittedAnswer: { _type: 'yearbook-challenge', year: year + offset },
          pool,
        })
      ).toBe(true)
    }
    for (const dialed of [year - 3, year + 3, Number.NaN]) {
      expect(
        isCorrectFinalAnswer({
          challenge,
          submittedAnswer: { _type: 'yearbook-challenge', year: dialed },
          pool,
        })
      ).toBe(false)
    }
    expect(() =>
      isCorrectFinalAnswer({
        challenge,
        submittedAnswer: { _type: 'region-challenge', region: 'europe' },
        pool,
      })
    ).toThrow(TypeError)
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

  it('grades endonym picks positionally against the dealt beats', () => {
    const challenge: EndonymChallenge = {
      _type: 'endonym-challenge',
      countries: ['FI', 'DE', 'CN', 'EG', 'HR'],
      quota: 4,
    }
    const grade = (isoCodes: ISOCountryCode[]) =>
      isCorrectFinalAnswer({
        challenge,
        submittedAnswer: { _type: 'endonym-challenge', isoCodes },
        pool,
      })

    expect(grade(['FI', 'DE', 'CN', 'EG', 'HR'])).toBe(true)
    // Four aligned hits with one miss still clear the quota
    expect(grade(['FI', 'DE', 'SE', 'EG', 'HR'])).toBe(true)
    // The right countries in the wrong beats count for nothing
    expect(grade(['HR', 'FI', 'DE', 'CN', 'EG'])).toBe(false)
    expect(grade(['FI', 'DE', 'SE', 'NO', 'HR'])).toBe(false)
    // A short early-submit array still aligns beat-for-beat
    expect(grade(['FI', 'DE', 'CN', 'EG'])).toBe(true)
    expect(grade([])).toBe(false)

    expect(() =>
      isCorrectFinalAnswer({
        challenge,
        submittedAnswer: { _type: 'born-challenge', isoCodes: ['FI'] },
        pool,
      })
    ).toThrow(TypeError)
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

describe('endonym data floors', () => {
  // Catches a countries regeneration gutting name.local — the endonym mode
  // silently starving would otherwise never fail a test
  it('keeps both tiers stocked on the world board', () => {
    const pool = Object.keys(COUNTRIES) as ISOCountryCode[]
    const withEndonym = pool.filter(isoCode => countryEndonym(isoCode))
    const transparent = withEndonym.filter(isTransparentEndonym)
    expect(transparent.length).toBeGreaterThanOrEqual(40)
    expect(withEndonym.length - transparent.length).toBeGreaterThanOrEqual(20)
  })
})

describe('diaspora challenge', () => {
  const MAGNET_REGIONS = ['europe', 'north-america']
  const acceptedWidth: { [difficulty in GameDifficulty]: number } = { easy: 3, normal: 2, hard: 1 }
  const pool = Object.keys(COUNTRIES) as ISOCountryCode[]

  const dealtDiasporas = (difficulty: GameDifficulty, variant: Game['variant'] = 'world') => {
    const dealt: DiasporaChallenge[] = []
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      for (const challenge of getFinalChallenges({ game: gameFor(variant, difficulty) })
        .challenges) {
        if (challenge._type === 'diaspora-challenge') dealt.push(challenge)
      }
    }
    return dealt
  }

  it('deals every difficulty a deck that leaves a miss absorbable', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const dealt = dealtDiasporas(difficulty)
      expect(dealt.length, difficulty).toBeGreaterThan(0)
      for (const challenge of dealt) {
        // The deck must exceed the quota — equal is all-or-nothing, which is
        // the bug that kept hard from dealing at all
        expect(challenge.origins.length).toBeGreaterThan(challenge.quota)
        expect(new Set(challenge.origins).size).toBe(challenge.origins.length)
        expect(challenge.accepted.length).toBe(challenge.origins.length)
      }
    }
  })

  it('opens the answer key by difficulty — one destination on hard, three on easy', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (const challenge of dealtDiasporas(difficulty)) {
        for (const options of challenge.accepted) {
          expect(options.length, difficulty).toBe(acceptedWidth[difficulty])
          expect(new Set(options).size).toBe(options.length)
        }
      }
    }
  })

  it('deals only decisive corridors', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (const challenge of dealtDiasporas(difficulty)) {
        for (const origin of challenge.origins) {
          expect(decisiveOrigins([origin]), origin).toEqual([origin])
        }
      }
    }
  })

  it('never lets one flag answer the whole deck', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (const challenge of dealtDiasporas(difficulty)) {
        const answers = challenge.accepted.map(([leading]) => leading)
        // Each beat's answer is its own country…
        expect(new Set(answers).size).toBe(answers.length)
        // …and the rich-world magnets never take more than half the beats
        const magnets = answers.filter(iso => MAGNET_REGIONS.includes(COUNTRIES[iso].region))
        expect(magnets.length).toBeLessThanOrEqual(Math.floor(challenge.origins.length / 2))
      }
    }
  })

  it('keeps easy answers next door and hard answers far from home', () => {
    const share = (difficulty: GameDifficulty) => {
      const beats = dealtDiasporas(difficulty).flatMap(challenge => challenge.origins)
      return beats.filter(hasObviousDestination).length / beats.length
    }
    // Easy deals the neighbour tier exclusively; hard exhausts the surprising
    // tier before it ever reaches a neighbour answer
    expect(share('easy')).toBe(1)
    expect(share('hard')).toBeLessThan(share('normal'))
  })

  it('never deals on a board too small for a representative deck (North America)', () => {
    // The continental boards each carry enough decisive corridors…
    expect(dealtDiasporas('hard', 'south-america').length).toBeGreaterThan(0)
    // …but North America cannot fill a deck whose answers are all distinct
    // and not all magnets, so the dealer stands down rather than repeat a flag
    expect(dealtDiasporas('hard', 'north-america').length).toBe(0)
  })

  it('grades picks positionally against each beat’s answer key', () => {
    const challenge: DiasporaChallenge = {
      _type: 'diaspora-challenge',
      origins: ['MX', 'PT', 'LK'],
      accepted: [['US', 'CA'], ['FR', 'CH'], ['IN']],
      quota: 2,
    }
    const grade = (isoCodes: ISOCountryCode[]) =>
      isCorrectFinalAnswer({
        challenge,
        submittedAnswer: { _type: 'diaspora-challenge', isoCodes },
        pool,
      })

    expect(grade(['US', 'FR', 'IN'])).toBe(true)
    // A runner-up counts wherever the key lists it
    expect(grade(['CA', 'CH', 'IN'])).toBe(true)
    // Two hits clear the quota even with a miss
    expect(grade(['US', 'DE', 'IN'])).toBe(true)
    expect(grade(['US', 'DE', 'PK'])).toBe(false)
    // The right countries in the wrong beats count for nothing
    expect(grade(['IN', 'US', 'FR'])).toBe(false)
  })

  it('throws when the submitted shape is not a diaspora answer', () => {
    expect(() =>
      isCorrectFinalAnswer({
        challenge: {
          _type: 'diaspora-challenge',
          origins: ['MX'],
          accepted: [['US']],
          quota: 1,
        },
        submittedAnswer: { _type: 'region-challenge', region: 'europe' },
        pool,
      })
    ).toThrow(TypeError)
  })
})

describe('diaspora data floors', () => {
  // Catches a migration regeneration starving the mode — a half-parsed matrix
  // still type-checks, and the dealer would just quietly stop dealing
  it('keeps both tiers stocked on the world board', () => {
    const decisive = decisiveOrigins(Object.keys(COUNTRIES) as ISOCountryCode[])
    expect(decisive.length).toBeGreaterThanOrEqual(60)
    const obvious = decisive.filter(hasObviousDestination)
    expect(obvious.length).toBeGreaterThanOrEqual(20)
    expect(decisive.length - obvious.length).toBeGreaterThanOrEqual(20)
  })
})

describe('MADE_COMMODITIES', () => {
  it('curates only commodities the data still ships', () => {
    const shipped = new Set(
      Object.values(COUNTRIES).flatMap(country => country.economics.exports ?? [])
    )
    for (const commodity of MADE_COMMODITIES) expect(shipped).toContain(commodity)
  })

  it('deals only curated commodities, and only ones with trade data', () => {
    for (let round = 0; round < DEAL_ROUNDS; round++) {
      const { challenges } = getFinalChallenges({ game: gameFor('world', 'hard') })
      for (const challenge of challenges) {
        if (challenge._type !== 'made-challenge') continue
        expect(MADE_COMMODITIES.has(challenge.commodity)).toBe(true)
        expect(madeTopExporters(challenge.commodity).length).toBeGreaterThan(0)
      }
    }
  })

  it('backs every curated commodity with the BACI exporters dataset', () => {
    for (const commodity of MADE_COMMODITIES) {
      expect(madeTopExporters(commodity).length, commodity).toBeGreaterThanOrEqual(
        MIN_STORED_EXPORTERS
      )
    }
  })

  it('accepts both readings: global top exporters AND own-top-5 countries', () => {
    // The union guarantee — every own-top-5 exporter stays a right answer
    for (const commodity of MADE_COMMODITIES) {
      const accepted = madeAcceptedCountries(commodity)
      for (const country of Object.values(COUNTRIES)) {
        if ((country.economics.exports ?? []).includes(commodity)) {
          expect(accepted.has(country.isoCode), `${commodity}: ${country.isoCode}`).toBe(true)
        }
      }
    }

    // The Brazil/tobacco regression, found dynamically: some global top
    // exporter absent from its own top-5 list must still validate
    const giants = [...MADE_COMMODITIES].flatMap(commodity =>
      madeTopExporters(commodity)
        .filter(row => !exportsCommodity(row.isoCode, commodity))
        .map(row => ({ commodity, isoCode: row.isoCode }))
    )
    expect(giants.length).toBeGreaterThan(0)
    for (const { commodity, isoCode } of giants.slice(0, 25)) {
      const correct = isCorrectFinalAnswer({
        challenge: { _type: 'made-challenge', commodity },
        submittedAnswer: { _type: 'made-challenge', isoCode },
        pool: Object.keys(COUNTRIES) as ISOCountryCode[],
      })
      expect(correct, `${commodity}: ${isoCode}`).toBe(true)
    }
  })
})
