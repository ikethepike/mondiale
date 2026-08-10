import alea from 'alea'
import { describe, expect, it } from 'vitest'
import { CAPITALS } from '~~/data/capitals.gen'
import { capitalCountryByName, capitalStar } from '~~/lib/capitals'
import { getRoundChallenge } from '~~/lib/challenges'
import { gradeGroupAnswer } from '~~/lib/events/server/grade-group-answer'
import { haversineKm } from '~~/lib/geo'
import {
  pickStarChart,
  starChartAnswers,
  starChartField,
  starChartInitials,
  starChartStars,
  STAR_CHART_STARS,
  STAR_CHART_TIERS,
  STAR_MIN_SEPARATION_KM,
} from '~~/lib/star-chart'
import type { StarChartChallenge } from '~~/types/challenges/group-modes.type'
import type { Game, GameDifficulty, GameVariant } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

const rules = (difficulty: GameDifficulty = 'normal', variant: GameVariant = 'world') =>
  ({ difficulty, variant }) as Game

const seeded = (seed: string) => alea(seed) as unknown as () => number

describe('capitalCountryByName', () => {
  it('resolves canonical capital names to their country', () => {
    expect(capitalCountryByName('Vienna')).toBe('AT')
    expect(capitalCountryByName('Ottawa')).toBe('CA')
    expect(capitalCountryByName('Canberra')).toBe('AU')
  })

  it('forgives case, accents and surrounding whitespace', () => {
    expect(capitalCountryByName('  brasilia ')).toBe('BR')
    expect(capitalCountryByName('BRASÍLIA')).toBe('BR')
  })

  it('accepts the dataset alt spellings a player might type', () => {
    // Every canonical name resolves; the alt index only ever widens that.
    const canonical = Object.entries(CAPITALS)
      .filter(([, capital]) => !!capital?.name)
      .map(([isoCode, capital]) => [isoCode as ISOCountryCode, capital!.name] as const)
    const misses = canonical.filter(([isoCode, name]) => capitalCountryByName(name) !== isoCode)
    expect(misses).toEqual([])
  })

  it('is undefined for a name no capital answers to', () => {
    expect(capitalCountryByName('Gothenburg')).toBeUndefined()
    expect(capitalCountryByName('')).toBeUndefined()
  })
})

describe('capitalStar', () => {
  it('places a capital on the globe with its population', () => {
    const star = capitalStar('AT')
    expect(star?.name).toBe('Vienna')
    expect(star?.lat).toBeGreaterThan(47)
    expect(star?.lat).toBeLessThan(49)
    expect(star?.population).toBeGreaterThan(0)
  })

  it('is undefined where the capital has no coordinates to pulse at', () => {
    // Below the cities15000 cut — the gate every star dealer relies on.
    expect(capitalStar('PW')).toBeUndefined()
  })
})

describe('starChartField', () => {
  it('sorts the capital field most populous first', () => {
    const field = starChartField(rules())
    expect(field.length).toBeGreaterThan(100)
    for (let index = 1; index < field.length; index++) {
      expect(field[index - 1]!.population).toBeGreaterThanOrEqual(field[index]!.population)
    }
  })

  it('scopes to the variant', () => {
    const europe = starChartField(rules('normal', 'europe'))
    expect(europe.length).toBeGreaterThanOrEqual(STAR_CHART_STARS)
    expect(europe.some(star => star.isoCode === 'JP')).toBe(false)
    expect(europe.some(star => star.isoCode === 'FR')).toBe(true)
  })
})

describe('STAR_CHART_TIERS', () => {
  it('climbs in obscurity within every difficulty', () => {
    for (const [difficulty, tiers] of Object.entries(STAR_CHART_TIERS)) {
      expect(tiers.length, difficulty).toBe(STAR_CHART_STARS)
      for (let index = 1; index < tiers.length; index++) {
        expect(tiers[index]![0], difficulty).toBeGreaterThanOrEqual(tiers[index - 1]![0])
        expect(tiers[index]![1], difficulty).toBeGreaterThan(tiers[index - 1]![1])
      }
    }
  })

  it('reaches deeper into the field as the game gets harder', () => {
    const deepest = (difficulty: GameDifficulty) =>
      STAR_CHART_TIERS[difficulty][STAR_CHART_STARS - 1]![1]
    expect(deepest('easy')).toBeLessThan(deepest('normal'))
    expect(deepest('normal')).toBeLessThan(deepest('hard'))
  })
})

describe('pickStarChart', () => {
  it('deals exactly the round`s star count, on every difficulty and variant', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as GameDifficulty[]) {
      for (const variant of ['world', 'europe', 'africa', 'asia'] as GameVariant[]) {
        const stars = pickStarChart(rules(difficulty, variant), seeded(`${difficulty}-${variant}`))
        expect(stars, `${difficulty}/${variant}`).toHaveLength(STAR_CHART_STARS)
        expect(new Set(stars).size, `${difficulty}/${variant}`).toBe(STAR_CHART_STARS)
      }
    }
  })

  it('never deals a near pair — the Vienna/Bratislava ambiguity guard', () => {
    // Every seed, every difficulty: two stars closer than the separation floor
    // would have no single answer at map scale.
    for (let seed = 0; seed < 60; seed++) {
      for (const difficulty of ['easy', 'normal', 'hard'] as GameDifficulty[]) {
        const stars = pickStarChart(rules(difficulty), seeded(`${difficulty}-${seed}`))!
        const points = stars.map(isoCode => capitalStar(isoCode)!)
        for (const [index, star] of points.entries()) {
          for (const other of points.slice(index + 1)) {
            expect(haversineKm(star, other), `${difficulty}/${seed}`).toBeGreaterThanOrEqual(
              STAR_MIN_SEPARATION_KM
            )
          }
        }
      }
    }
  })

  it('keeps every dealt star resolvable to a point on the globe', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const isoCode of pickStarChart(rules('hard'), seeded(`resolve-${seed}`))!) {
        expect(capitalStar(isoCode), isoCode).toBeDefined()
      }
    }
  })

  it('leads easy games with household capitals', () => {
    // The opening star of an easy night is drawn from the very top of the
    // population-sorted field, so it is a name a first-time player has met.
    const field = starChartField(rules('easy'))
    const window = Math.ceil(field.length * STAR_CHART_TIERS.easy[0]![1])
    const top = new Set(field.slice(0, window).map(star => star.isoCode))
    for (let seed = 0; seed < 20; seed++) {
      const [first] = pickStarChart(rules('easy'), seeded(`easy-${seed}`))!
      expect(top.has(first!), first).toBe(true)
    }
  })

  it('yields to another round kind when the board has no sky to fill', () => {
    // No shipped variant is this thin, so the guard is driven through an empty
    // pool: a dealer that returned three of nothing would freeze the round.
    const empty = { difficulty: 'normal', variant: 'atlantis' } as unknown as Game
    expect(starChartField(empty)).toEqual([])
    expect(pickStarChart(empty)).toBeUndefined()
  })
})

describe('starChartStars', () => {
  it('resolves the dealt codes in dealt order, dropping nothing resolvable', () => {
    const challenge: StarChartChallenge = {
      _type: 'star-chart-challenge',
      stars: ['AT', 'CA', 'AU'],
      durationSeconds: 45,
      maximumPoints: 21,
    }
    expect(starChartStars(challenge).map(star => star.name)).toEqual([
      'Vienna',
      'Ottawa',
      'Canberra',
    ])
  })

  it('drops a star whose capital stopped resolving rather than placing it at 0°,0°', () => {
    const challenge: StarChartChallenge = {
      _type: 'star-chart-challenge',
      stars: ['AT', 'PW'],
      durationSeconds: 45,
      maximumPoints: 21,
    }
    expect(starChartStars(challenge).map(star => star.isoCode)).toEqual(['AT'])
  })
})

describe('starChartAnswers', () => {
  it('grades only what a player can actually see and type', async () => {
    // MN's capital has no row in the city dataset, so it renders nowhere. If
    // it were still in the answer set the round could never be completed:
    // no early finish, and a slice of the pot nobody at the table can reach.
    const challenge: StarChartChallenge = {
      _type: 'star-chart-challenge',
      stars: ['AT', 'MN', 'CA'],
      durationSeconds: 45,
      maximumPoints: 21,
    }
    expect(starChartAnswers(challenge)).toEqual(['AT', 'CA'])

    const { scoring } = await gradeGroupAnswer({
      game: rules(),
      round: { groupChallenge: challenge, groupAnswers: {}, playerTurns: {} } as never,
      playerId: 'p1',
      submission: { ranking: ['AT', 'CA'] },
    })
    expect(scoring).toEqual({ scored: 21, maximum: 21 })
  })

  it('is exactly the dealt list for every real deal', () => {
    for (let seed = 0; seed < 30; seed++) {
      const stars = pickStarChart(rules('hard'), seeded(`answers-${seed}`))!
      const challenge: StarChartChallenge = {
        _type: 'star-chart-challenge',
        stars,
        durationSeconds: 45,
        maximumPoints: 21,
      }
      expect(starChartAnswers(challenge)).toEqual(stars)
    }
  })
})

describe('starChartInitials', () => {
  it('reads the aid off the same canonical names an answer matches on', () => {
    expect(starChartInitials(['AT', 'CA', 'AU'])).toEqual(['V', 'O', 'C'])
  })
})

describe('the star-chart round', () => {
  const game = (difficulty: GameDifficulty = 'normal') =>
    ({
      id: 'star-chart-test',
      difficulty,
      variant: 'world',
      rounds: [],
      players: {},
      challengeOverrides: {},
    }) as unknown as Game

  const dealt = async (difficulty: GameDifficulty = 'normal') => {
    process.env.FORCE_ROUND_TYPE = 'star-chart'
    try {
      return (await getRoundChallenge({ game: game(difficulty) })) as StarChartChallenge
    } finally {
      delete process.env.FORCE_ROUND_TYPE
    }
  }

  it('deals through the round mix with a clock and a pot', async () => {
    const challenge = await dealt()
    expect(challenge._type).toBe('star-chart-challenge')
    expect(challenge.stars).toHaveLength(STAR_CHART_STARS)
    expect(challenge.durationSeconds).toBeGreaterThan(0)
    expect(challenge.maximumPoints).toBeGreaterThan(0)
  })

  it('carries the initials aid outside hard mode only', async () => {
    expect((await dealt('easy')).initials).toHaveLength(STAR_CHART_STARS)
    expect((await dealt('normal')).initials).toHaveLength(STAR_CHART_STARS)
    expect((await dealt('hard')).initials).toBeUndefined()
  })

  it('grades server-side as a collect-a-set — no client score to trust', async () => {
    const challenge: StarChartChallenge = {
      _type: 'star-chart-challenge',
      stars: ['AT', 'CA', 'AU'],
      durationSeconds: 45,
      maximumPoints: 21,
    }
    const round = { groupChallenge: challenge, groupAnswers: {}, playerTurns: {} } as never
    const grade = (submitted: ISOCountryCode[], clientScore?: number) =>
      gradeGroupAnswer({
        game: game(),
        round,
        playerId: 'p1',
        submission: { ranking: submitted, ...(clientScore ? { clientScore } : {}) },
      })

    expect((await grade(['AT', 'CA', 'AU'])).scoring).toEqual({ scored: 21, maximum: 21 })
    // A named star pays its share; a capital that wasn't up there costs one.
    expect((await grade(['AT'])).scoring.scored).toBe(7)
    expect((await grade(['AT', 'SK'])).scoring.scored).toBe(6)
    // The claim is ignored outright — the answer list is the only input.
    expect((await grade([], 21)).scoring).toEqual({ scored: 0, maximum: 21 })

    const { answer } = await grade(['AT', 'SK'])
    expect(answer.correct).toEqual(['AT', 'CA', 'AU'])
    expect(answer.submitted).toEqual(['AT', 'SK'])
  })

  it('banks an absent seat a zero while still showing it the sky', async () => {
    const challenge: StarChartChallenge = {
      _type: 'star-chart-challenge',
      stars: ['AT', 'CA', 'AU'],
      durationSeconds: 45,
      maximumPoints: 21,
    }
    const { scoring, answer } = await gradeGroupAnswer({
      game: game(),
      round: { groupChallenge: challenge, groupAnswers: {}, playerTurns: {} } as never,
      playerId: 'p1',
      submission: { ranking: [] },
      absent: true,
    })
    expect(scoring).toEqual({ scored: 0, maximum: 21 })
    expect(answer.correct).toEqual(['AT', 'CA', 'AU'])
  })
})
