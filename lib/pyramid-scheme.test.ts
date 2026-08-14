import { afterEach, describe, expect, it } from 'vitest'
import { getRoundChallenge } from '~~/lib/challenges'
import { PYRAMID_TUNING, pyramidDistance, pyramidsAreDistinct } from '~~/lib/pyramids'
import type { PyramidSchemeChallenge } from '~~/types/challenges/group-modes.type'
import type { Game, GameDifficulty, GameVariant } from '~~/types/game.types'

const game = (difficulty: GameDifficulty, variant: GameVariant = 'world') =>
  ({
    variant,
    difficulty,
    rounds: [{}],
    players: { a: { phase: 'group-challenge' } },
  }) as unknown as Game

const deal = async (difficulty: GameDifficulty, variant: GameVariant = 'world') => {
  process.env.FORCE_ROUND_TYPE = 'pyramid-scheme'
  return (await getRoundChallenge({ game: game(difficulty, variant) })) as PyramidSchemeChallenge
}

afterEach(() => {
  delete process.env.FORCE_ROUND_TYPE
})

describe('pyramid scheme dealer', () => {
  it('deals its own kind at every difficulty', async () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const challenge = await deal(difficulty)
      expect(challenge._type).toBe('pyramid-scheme-challenge')
      expect(challenge.countries).toHaveLength(PYRAMID_TUNING[difficulty].subjects)
      expect(new Set(challenge.countries).size).toBe(challenge.countries.length)
      expect(challenge.maximumPoints).toBeGreaterThan(0)
      expect(challenge.durationSeconds).toBeGreaterThan(0)
    }
  })

  it('never deals a set a player could not tell apart', async () => {
    // The guarantee the whole mode rests on. Dealt at random, four countries
    // hold a visually identical pair 85% of the time — this sweep is what says
    // the gate is really applied rather than merely intended.
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const floor = PYRAMID_TUNING[difficulty].floor
      for (let round = 0; round < 40; round++) {
        const challenge = await deal(difficulty)
        expect(pyramidsAreDistinct(challenge.countries, floor)).toBe(true)
        expect(challenge.distinctnessFloor).toBe(floor)
      }
    }
  })

  it('keeps the floor honest — it is the difficulty axis', () => {
    // Harder means shapes that resemble one another MORE, so the floor falls.
    expect(PYRAMID_TUNING.easy.floor).toBeGreaterThan(PYRAMID_TUNING.normal.floor)
    expect(PYRAMID_TUNING.normal.floor).toBeGreaterThan(PYRAMID_TUNING.hard.floor)
  })

  it('deals a fresh set rather than one fixed roster', async () => {
    // A gate this tight could quietly collapse onto the same handful of
    // countries; the mode would be solved after two games.
    const seen = new Set<string>()
    for (let round = 0; round < 30; round++) {
      const challenge = await deal('normal')
      for (const isoCode of challenge.countries) seen.add(isoCode)
    }
    expect(seen.size).toBeGreaterThan(30)
  })

  it('still deals on a continental board', async () => {
    // Africa is the hard case: its age structures are the most alike on earth,
    // so if any variant starves the floor it is this one. Undefined is an
    // acceptable answer (the mix buys another kind) — a set that BREAKS the
    // floor is not.
    for (const variant of ['africa', 'europe', 'asia'] as GameVariant[]) {
      const challenge = await deal('normal', variant)
      if (challenge?._type !== 'pyramid-scheme-challenge') continue
      expect(pyramidsAreDistinct(challenge.countries, challenge.distinctnessFloor)).toBe(true)
    }
  })

  it('measures the pairs that make the gate necessary', () => {
    // The twins that would ruin a deal, and the extremes that carry a good one.
    expect(pyramidDistance('CM', 'BJ')).toBeLessThan(5)
    expect(pyramidDistance('GB', 'NO')).toBeLessThan(8)
    expect(pyramidDistance('NE', 'JP')).toBeGreaterThan(60)
    expect(pyramidDistance('QA', 'NE')).toBeGreaterThan(60)
  })
})
