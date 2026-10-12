import Alea from 'alea'
import { afterEach, describe, expect, it } from 'vitest'
import { getRoundChallenge } from '~~/lib/challenges'
import {
  PYRAMID_TUNING,
  drawPyramidDeal,
  pyramidAgedApart,
  pyramidDecoyFits,
  pyramidFamily,
  pyramidReadoutGap,
} from '~~/lib/pyramids'
import type { PyramidSchemeChallenge } from '~~/types/challenges/group-modes.type'
import { gradeGroupAnswer } from '~~/lib/events/server/grade-group-answer'
import { guessPolicyFor } from '~~/lib/live-guess-policy'
import {
  gameVariants,
  type Game,
  type GameDifficulty,
  type GameVariant,
  type Round,
} from '~~/types/game.types'
import { regionsForVariant } from '~~/lib/board-regions'
import { playableCountries } from '~~/lib/game-rules'

const DIFFICULTIES = ['easy', 'normal', 'hard'] as const

const game = (difficulty: GameDifficulty, variant: GameVariant = 'world') =>
  ({
    regions: regionsForVariant(variant),
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
  it('deals one subject among its options at every difficulty', async () => {
    for (const difficulty of DIFFICULTIES) {
      const challenge = await deal(difficulty)
      expect(challenge._type).toBe('pyramid-scheme-challenge')
      expect(challenge.options).toHaveLength(PYRAMID_TUNING[difficulty].options)
      expect(new Set(challenge.options).size).toBe(challenge.options.length)
      expect(challenge.options).toContain(challenge.country)
      expect(challenge.maximumGuesses).toBe(PYRAMID_TUNING[difficulty].attempts)
      expect(challenge.maximumPoints).toBeGreaterThan(0)
    }
  })

  it('draws every decoy from the band it reports, on every board', async () => {
    for (const variant of gameVariants) {
      for (const difficulty of DIFFICULTIES) {
        for (let round = 0; round < 10; round++) {
          const { country, options, band } = await deal(difficulty, variant)
          for (const decoy of options.filter(option => option !== country)) {
            expect(pyramidDecoyFits(country, decoy, PYRAMID_TUNING[band].decoys)).toBe(true)
          }
        }
      }
    }
  })

  it('gives a hard table that borrowed an easier band one guess', async () => {
    const borrowed = await deal('hard', 'europe')
    expect(borrowed.band).not.toBe('hard')
    expect(borrowed.maximumGuesses).toBe(1)
    expect((await deal('hard')).maximumGuesses).toBe(PYRAMID_TUNING.hard.attempts)
    expect((await deal('normal', 'europe')).maximumGuesses).toBe(PYRAMID_TUNING.normal.attempts)
  })

  it('deals the world board its own band at every difficulty', async () => {
    for (const difficulty of DIFFICULTIES) expect((await deal(difficulty)).band).toBe(difficulty)
  })

  it('deals on every board at every difficulty', async () => {
    // The pairwise floor this replaced left 7 of these 18 dead.
    for (const variant of gameVariants) {
      for (const difficulty of DIFFICULTIES) {
        const challenge = await deal(difficulty, variant)
        expect(challenge?._type, `${variant} ${difficulty}`).toBe('pyramid-scheme-challenge')
      }
    }
  })

  it('makes every hard decoy a story the readout can tell', async () => {
    // A bare shape gap in some frame left a quarter of hard deals unreadable:
    // every decoy must have aged years apart and show a readout gap a player can see.
    const { agedApart, readoutFrom } = PYRAMID_TUNING.hard.decoys
    for (let round = 0; round < 40; round++) {
      const { country, options } = await deal('hard')
      for (const decoy of options.filter(option => option !== country)) {
        expect(pyramidAgedApart(country, decoy)).toBeGreaterThanOrEqual(agedApart!)
        expect(pyramidReadoutGap(country, decoy)).toBeGreaterThanOrEqual(readoutFrom!)
      }
    }
  })

  it('steps a thin board down a band rather than repeating a handful', async () => {
    // Africa's hard table alone held five subjects.
    const seen = new Set<string>()
    for (let round = 0; round < 60; round++) seen.add((await deal('hard', 'africa')).country)
    expect(seen.size).toBeGreaterThan(15)
  })

  it('deals every option from the board itself', async () => {
    // An off-board option can never be the answer — on Europe's easy table the
    // one European name gave the round away.
    for (const variant of gameVariants) {
      for (const difficulty of DIFFICULTIES) {
        const board = new Set(playableCountries(game(difficulty, variant)))
        const { options } = await deal(difficulty, variant)
        for (const option of options) expect(board.has(option), `${variant} ${option}`).toBe(true)
      }
    }
  })

  it('never lets an option give the answer away', () => {
    // A fair option is the answer in one deal of `options`. One that is shown
    // often but rarely answers (Montenegro, three deals in four on Europe's
    // hard table) is eliminated without reading the pyramid.
    const deals = 600
    for (const variant of gameVariants) {
      for (const difficulty of DIFFICULTIES) {
        const random = Alea(`${variant}:${difficulty}`)
        const pool = playableCountries(game(difficulty, variant))
        const shown = new Map<string, number>()
        const answered = new Map<string, number>()
        for (let round = 0; round < deals; round++) {
          const { country, decoys } = drawPyramidDeal(pool, difficulty, random)!
          answered.set(country, (answered.get(country) ?? 0) + 1)
          for (const option of [country, ...decoys]) shown.set(option, (shown.get(option) ?? 0) + 1)
        }
        for (const [option, count] of shown) {
          if (count < deals * 0.1) continue
          const rate = (answered.get(option) ?? 0) / count
          expect(rate, `${variant} ${difficulty} ${option}`).toBeGreaterThan(0.06)
        }
      }
    }
  }, 60_000)

  it('keeps the Gulf slab near its share of the board', async () => {
    // Under the pairwise floor one of the seven slabs sat in 86% of easy deals.
    let withSlab = 0
    const deals = 300
    for (let round = 0; round < deals; round++) {
      const { options } = await deal('easy')
      if (options.some(option => pyramidFamily(option) === 'migrant-slab')) withSlab++
    }
    expect(withSlab / deals).toBeLessThan(0.3)
  })

  it('deals a fresh subject rather than one fixed roster', async () => {
    for (const variant of ['world', 'europe'] as const) {
      const seen = new Set<string>()
      for (let round = 0; round < 60; round++) seen.add((await deal('normal', variant)).country)
      expect(seen.size, variant).toBeGreaterThan(20)
    }
  })
})

const gradedRound = (country: string, options: string[]) =>
  ({
    groupChallenge: {
      _type: 'pyramid-scheme-challenge',
      country,
      options,
      band: 'easy',
      maximumGuesses: 2,
      durationSeconds: 40,
      maximumPoints: 20,
    },
    groupAnswers: {},
    playerTurns: {},
  }) as unknown as Round

describe('pyramid scheme grading', () => {
  const grade = (submitted: string[], absent = false) =>
    gradeGroupAnswer({
      game: {} as Game,
      round: gradedRound('JP', ['NE', 'JP', 'QA', 'IN']),
      playerId: 'p',
      submission: { ranking: submitted } as never,
      absent,
    })

  it('pays the first try in full and the second try less', async () => {
    const first = (await grade(['JP'])).scoring.scored
    const second = (await grade(['NE', 'JP'])).scoring.scored
    expect(first).toBe(20)
    expect(second).toBeGreaterThan(0)
    expect(second).toBeLessThan(first)
  })
  it('pays nothing past the cap or on a miss', async () => {
    expect((await grade(['NE', 'QA'])).scoring.scored).toBe(0)
    expect((await grade(['NE', 'QA', 'JP'])).scoring.scored).toBe(0)
    expect((await grade([])).scoring.scored).toBe(0)
  })
  it('grades a round dealt before the redesign as zero, never a free hit', async () => {
    const legacy = {
      groupChallenge: {
        _type: 'pyramid-scheme-challenge',
        countries: ['DE', 'NE', 'QA', 'JP'],
        distinctnessFloor: 22,
        durationSeconds: 55,
        maximumPoints: 20,
      },
      groupAnswers: {},
      playerTurns: {},
    } as unknown as Round
    const { scoring } = await gradeGroupAnswer({
      game: {} as Game,
      round: legacy,
      playerId: 'p',
      submission: { ranking: [] } as never,
    })
    expect(scoring).toEqual({ scored: 0, maximum: 20 })
  })

  it('zeroes an absent seat but still reports the truth', async () => {
    const { scoring, answer } = await grade([], true)
    expect(scoring.scored).toBe(0)
    expect(answer.correct).toEqual(['JP'])
  })
})

describe('pyramid scheme live messaging', () => {
  const challenge = gradedRound('JP', ['NE', 'JP', 'QA', 'IN']).groupChallenge
  it('shares presence, never the pick', () => {
    expect(guessPolicyFor({ liveGuesses: true } as unknown as Game, challenge)).toBe('presence')
  })
  it('honours the table switching live guesses off', () => {
    expect(guessPolicyFor({ liveGuesses: false } as unknown as Game, challenge)).toBe('none')
  })
})
