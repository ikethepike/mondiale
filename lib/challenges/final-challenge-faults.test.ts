import { afterEach, describe, expect, it, vi } from 'vitest'
import { regionsForVariant } from '~~/lib/board-regions'
import type { Game } from '~~/types/game.types'
import { playableCountries } from '~~/lib/game-rules'
import {
  dealFinalChallenge,
  dealReplacementChallenge,
  eligibleFinalTypes,
  getFinalChallenges,
} from './final-challenge'

vi.mock('~~/lib/sunset-window', async importOriginal => ({
  ...(await importOriginal<typeof import('~~/lib/sunset-window')>()),
  pickSunsetWindow: () => {
    throw new TypeError('broken sunset dealer')
  },
}))

const game = { id: 'faulty', regions: regionsForVariant('world'), difficulty: 'hard' } as Game

describe('a final dealer that throws', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is reported with its type and skipped', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(dealFinalChallenge('sunset-blitz-challenge', game)).toBeUndefined()
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("'sunset-blitz-challenge' crashed for faulty"),
      expect.any(TypeError)
    )
  })

  it('leaves the gauntlet and the replacement dealing from the other types', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (let round = 0; round < 50; round++) {
      const { challenges } = getFinalChallenges({ game })
      expect(challenges.length).toBeGreaterThan(0)
      expect(challenges.map(item => item._type)).not.toContain('sunset-blitz-challenge')

      const replacement = dealReplacementChallenge({ game, exclude: [] })
      expect(replacement?._type).toBeDefined()
      expect(replacement?._type).not.toBe('sunset-blitz-challenge')
    }
    expect(error).toHaveBeenCalled()
  })

  it('tries a crashing type only once per replacement deal', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exclude = eligibleFinalTypes(game, playableCountries(game)).filter(
      type => type !== 'sunset-blitz-challenge'
    )
    for (let round = 0; round < 100; round++) {
      error.mockClear()
      expect(dealReplacementChallenge({ game, exclude })).toBeDefined()
      expect(error).toHaveBeenCalledTimes(1)
    }
  })
})
