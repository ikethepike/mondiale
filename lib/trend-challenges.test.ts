import { afterEach, describe, expect, it } from 'vitest'
import { TRENDS } from '~~/data/trends.gen'
import { getIndividualChallenge, getRoundChallenge, scoreTrendRace } from '~~/lib/challenges'
import { readTrend } from '~~/lib/trends'
import type { TrendRaceChallenge } from '~~/types/challenges/group-modes.type'
import type { Game, GameDifficulty } from '~~/types/game.types'

const game = (difficulty: GameDifficulty, overrides?: object): Game =>
  ({
    variant: 'world',
    difficulty,
    rounds: [{}],
    players: {},
    ...(overrides ? { challengeOverrides: overrides } : {}),
  }) as unknown as Game

afterEach(() => {
  delete process.env.FORCE_INDIVIDUAL_VARIANT
  delete process.env.FORCE_ROUND_TYPE
})

describe('dealTrendDuels (via getIndividualChallenge)', () => {
  it('deals a streak of one-riser-one-faller duels, fresh countries and metrics', () => {
    process.env.FORCE_INDIVIDUAL_VARIANT = 'trend-duel'
    const streaks: { [difficulty in GameDifficulty]: number } = { easy: 3, normal: 4, hard: 5 }

    for (const [difficulty, expected] of Object.entries(streaks)) {
      const dealt = getIndividualChallenge({
        accessorId: 'capital.name',
        difficulty: difficulty as GameDifficulty,
        variant: 'world',
      })
      const duels = dealt.trendDuels
      expect(duels).toHaveLength(expected)

      const used = new Set<string>()
      const metrics = new Set<string>()
      for (const duel of duels!) {
        const directions = [duel.a, duel.b].map(
          isoCode => readTrend(TRENDS[isoCode]?.[duel.metric], duel.metric)?.direction
        )
        expect(directions.sort()).toEqual(['falling', 'rising'])
        expect(used.has(duel.a) || used.has(duel.b)).toBe(false)
        used.add(duel.a)
        used.add(duel.b)
        expect(metrics.has(duel.metric)).toBe(false)
        metrics.add(duel.metric)
      }
    }
  })

  it('refuses to deal when the trends group is toggled off', () => {
    process.env.FORCE_INDIVIDUAL_VARIANT = 'trend-duel'
    const dealt = getIndividualChallenge({
      accessorId: 'capital.name',
      difficulty: 'normal',
      variant: 'world',
      challengeOverrides: { trends: false },
    })
    expect(dealt.trendDuels).toBeUndefined()
    expect(dealt.variant).toBe('find')
  })
})

describe('dealTrajectoryMatch (via getIndividualChallenge)', () => {
  it('deals a decisive mystery country among its options, sized by difficulty', () => {
    process.env.FORCE_INDIVIDUAL_VARIANT = 'trajectory-match'
    const optionCounts: { [difficulty in GameDifficulty]: number } = { easy: 4, normal: 5, hard: 6 }

    for (const [difficulty, expected] of Object.entries(optionCounts)) {
      const dealt = getIndividualChallenge({
        accessorId: 'isoCode',
        difficulty: difficulty as GameDifficulty,
        variant: 'world',
      })
      const trajectory = dealt.trajectory
      expect(trajectory).toBeDefined()
      expect(trajectory!.options).toHaveLength(expected)
      expect(trajectory!.options).toContain(dealt.country)
      expect(trajectory!.valuesHint).toBe(difficulty !== 'hard')

      const reading = readTrend(TRENDS[dealt.country]?.[trajectory!.metric], trajectory!.metric)
      expect(reading).toBeDefined()
      expect(reading!.direction).not.toBe('flat')
    }
  })

  it('refuses to deal when the trends group is toggled off', () => {
    process.env.FORCE_INDIVIDUAL_VARIANT = 'trajectory-match'
    const dealt = getIndividualChallenge({
      accessorId: 'isoCode',
      difficulty: 'normal',
      variant: 'world',
      challengeOverrides: { trends: false },
    })
    expect(dealt.trajectory).toBeUndefined()
  })
})

describe('getTrendRaceChallenge (via getRoundChallenge)', () => {
  it('deals a decisive race over a shared window', async () => {
    process.env.FORCE_ROUND_TYPE = 'trend-race'
    const challenge = (await getRoundChallenge({ game: game('normal') })) as TrendRaceChallenge
    expect(challenge._type).toBe('trend-race-challenge')

    // Standings are a permutation of the options, winner first.
    expect([...challenge.standings].sort()).toEqual([...challenge.options].sort())
    expect(challenge.options).toContain(challenge.standings[0])

    // Every option moves in the raced direction over the SHARED window.
    const seek = challenge.direction === 'risen' ? 'rising' : 'falling'
    for (const isoCode of challenge.options) {
      const clipped = TRENDS[isoCode]![challenge.metric]!.filter(
        ([year]) => year >= challenge.windowStartYear
      )
      expect(readTrend(clipped, challenge.metric)?.direction).toBe(seek)
    }
  })

  it('never deals when the trends group is toggled off (unforced weights)', async () => {
    for (let i = 0; i < 40; i++) {
      const challenge = await getRoundChallenge({ game: game('normal', { trends: false }) })
      expect(
        '_type' in challenge && challenge._type === 'trend-race-challenge'
      ).toBe(false)
    }
  })
})

describe('scoreTrendRace', () => {
  const challenge: TrendRaceChallenge = {
    _type: 'trend-race-challenge',
    metric: 'childMortality',
    direction: 'fallen',
    options: ['KR', 'BD', 'TR', 'PT', 'PL'],
    standings: ['BD', 'KR', 'TR', 'PT', 'PL'],
    windowStartYear: 1983,
    durationSeconds: 30,
    maximumPoints: 15,
  }

  it('pays full marks for the winner and tapers to nothing for the weakest', () => {
    expect(scoreTrendRace({ challenge, submittedGuesses: ['BD'] })).toEqual({
      scored: 15,
      maximum: 15,
    })
    const runnerUp = scoreTrendRace({ challenge, submittedGuesses: ['KR'] }).scored
    expect(runnerUp).toBeGreaterThan(0)
    expect(runnerUp).toBeLessThan(15)
    expect(scoreTrendRace({ challenge, submittedGuesses: ['PL'] }).scored).toBe(0)
  })

  it('scores nothing for a foreign pick or an empty submission', () => {
    expect(scoreTrendRace({ challenge, submittedGuesses: ['SE'] }).scored).toBe(0)
    expect(scoreTrendRace({ challenge, submittedGuesses: [] }).scored).toBe(0)
  })
})
