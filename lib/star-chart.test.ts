import alea from 'alea'
import { describe, expect, it } from 'vitest'
import { capitalStar } from '~~/lib/capitals'
import { getRoundChallenge } from '~~/lib/challenges'
import { gradeGroupAnswer } from '~~/lib/events/server/grade-group-answer'
import { haversineKm } from '~~/lib/geo'
import {
  pickStarChart,
  starChartAnswers,
  starChartField,
  starChartInitials,
  starChartSeconds,
  starChartStars,
  starWindows,
  STAR_CHART_MAX_SECONDS,
  STAR_CHART_REACH,
  STAR_CHART_STARS,
  STAR_MIN_SEPARATION_KM,
} from '~~/lib/star-chart'
import type { StarChartChallenge } from '~~/types/challenges/group-modes.type'
import type { Game, GameDifficulty, GameVariant } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

const rules = (difficulty: GameDifficulty = 'normal', variant: GameVariant = 'world') =>
  ({ difficulty, variant }) as Game

const seeded = (seed: string) => alea(seed) as unknown as () => number

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

describe('starWindows', () => {
  it('climbs in obscurity within every difficulty, at any star count', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as GameDifficulty[]) {
      for (const count of [3, 5, 7]) {
        const windows = starWindows(difficulty, count)
        expect(windows.length, `${difficulty}/${count}`).toBe(count)
        for (let index = 1; index < windows.length; index++) {
          expect(windows[index]![0], `${difficulty}/${count}`).toBeGreaterThan(
            windows[index - 1]![0]
          )
          expect(windows[index]![1], `${difficulty}/${count}`).toBeGreaterThan(
            windows[index - 1]![1]
          )
        }
      }
    }
  })

  it('stays inside its difficulty`s reach', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as GameDifficulty[]) {
      const [from, to] = STAR_CHART_REACH[difficulty]
      for (const [low, high] of starWindows(difficulty)) {
        expect(low, difficulty).toBeGreaterThanOrEqual(from)
        expect(high, difficulty).toBeLessThanOrEqual(to)
        expect(high, difficulty).toBeGreaterThan(low)
      }
    }
  })

  it('overlaps, so a thin continental field can still fill every star', () => {
    // Disjoint windows would strand a small variant: each star would be
    // confined to a fifth of a field that only holds a dozen capitals.
    const windows = starWindows('normal')
    for (let index = 1; index < windows.length; index++) {
      expect(windows[index]![0]).toBeLessThan(windows[index - 1]![1])
    }
  })
})

describe('STAR_CHART_REACH', () => {
  it('reaches deeper into the field as the game gets harder', () => {
    expect(STAR_CHART_REACH.easy[1]).toBeLessThan(STAR_CHART_REACH.normal[1])
    expect(STAR_CHART_REACH.normal[1]).toBeLessThan(STAR_CHART_REACH.hard[1])
  })

  it('gives up the very top of the field on hard only', () => {
    expect(STAR_CHART_REACH.easy[0]).toBe(0)
    expect(STAR_CHART_REACH.normal[0]).toBe(0)
    expect(STAR_CHART_REACH.hard[0]).toBeGreaterThan(0)
  })
})

describe('starChartSeconds', () => {
  it('grows with the star count and caps', () => {
    expect(starChartSeconds(3)).toBeLessThan(starChartSeconds(5))
    expect(starChartSeconds(STAR_CHART_STARS)).toBeLessThanOrEqual(STAR_CHART_MAX_SECONDS)
    expect(starChartSeconds(50)).toBe(STAR_CHART_MAX_SECONDS)
  })
})

describe('pickStarChart', () => {
  it('deals exactly the round`s star count, on every difficulty and variant', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as GameDifficulty[]) {
      for (const variant of [
        'world',
        'europe',
        'africa',
        'asia',
        'north-america',
        'south-america',
      ] as GameVariant[]) {
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
    const window = Math.ceil(field.length * starWindows('easy')[0]![1])
    const top = new Set(field.slice(0, window).map(star => star.isoCode))
    for (let seed = 0; seed < 20; seed++) {
      const [first] = pickStarChart(rules('easy'), seeded(`easy-${seed}`))!
      expect(top.has(first!), first).toBe(true)
    }
  })

  it('deals a night that really does climb in obscurity', () => {
    // The windows climbing is one thing; the DEALT stars climbing is what the
    // player feels. Measured on the world board, where the field is deep
    // enough for the ladder to be real.
    //
    // Deliberately not asserted for easy on a continental variant: South
    // America holds twelve capitals and easy reaches 45% of them, so five
    // windows share ~6 candidates and the ladder flattens. That is a property
    // of a twelve-capital board, not a tuning failure — and on easy every one
    // of those capitals is meant to be gettable anyway.
    for (const difficulty of ['easy', 'normal', 'hard'] as GameDifficulty[]) {
      const field = starChartField(rules(difficulty))
      const depthOf = new Map(field.map((star, index) => [star.isoCode, index / field.length]))
      const totals = Array.from({ length: STAR_CHART_STARS }, () => 0)
      const RUNS = 60
      for (let seed = 0; seed < RUNS; seed++) {
        pickStarChart(rules(difficulty), seeded(`ladder-${difficulty}-${seed}`))!.forEach(
          (isoCode, index) => (totals[index]! += depthOf.get(isoCode) ?? 0)
        )
      }
      for (let index = 1; index < totals.length; index++) {
        expect(totals[index], `${difficulty} star ${index + 1}`).toBeGreaterThan(totals[index - 1]!)
      }
    }
  })

  it('yields to another round kind when the board has no sky to fill', () => {
    // No shipped variant is this thin, so the guard is driven through an empty
    // pool: a dealer that returned five of nothing would freeze the round.
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
    // Ngerulmud is absent from the city dataset, so a PW star renders nowhere.
    // If it were still in the answer set the round could never be completed:
    // no early finish, and a slice of the pot nobody at the table can reach.
    const challenge: StarChartChallenge = {
      _type: 'star-chart-challenge',
      stars: ['AT', 'PW', 'CA'],
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
