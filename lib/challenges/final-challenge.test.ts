import { describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import type { Game, GameDifficulty } from '~~/types/game.types'
import { dealReplacementChallenge, GAUNTLET_LIVES, getFinalChallenges } from './final-challenge'

const gameFor = (variant: Game['variant'], difficulty: GameDifficulty) =>
  ({ variant, difficulty }) as Game

const isMember = (isoCode: string, organization: string) =>
  COUNTRIES[isoCode as keyof typeof COUNTRIES].membership.some(
    entry => entry.id === organization
  )

const DEAL_ROUNDS = 200

describe('getFinalChallenges', () => {
  it('deals the difficulty-scaled length, lives and progress fields', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const gauntlet = getFinalChallenges({ game: gameFor('world', difficulty) })
      expect(gauntlet.lives).toBe(GAUNTLET_LIVES[difficulty])
      expect(gauntlet.totalCount).toBe(gauntlet.challenges.length)
      expect(gauntlet.answeredCorrect).toBe(0)
      expect(gauntlet.challenges.length).toBeGreaterThan(0)
      expect(gauntlet.challenges.length).toBeLessThanOrEqual({ easy: 2, normal: 3, hard: 5 }[difficulty])
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
        expect(['membership-challenge', 'scales-challenge', 'sunset-blitz-challenge']).not.toContain(
          challenge._type
        )
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
