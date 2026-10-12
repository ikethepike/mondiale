import { afterEach, describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'
import { COUNTRIES } from '~~/data/countries.gen'
import { capitalGuessScore, getRoundChallenge } from '~~/lib/challenges'
import { getCountry } from '~~/lib/country'
import { gradeGroupAnswer } from '~~/lib/events/server/grade-group-answer'
import {
  compositionBoards,
  COMPOSITION_CLEAR_MARGIN,
  COMPOSITION_MIN_MARGIN,
  COMPOSITION_MIN_SLICES,
  COMPOSITION_MIN_TOTAL,
  corridorMargin,
  corridorsToDestination,
} from '~~/lib/migration'
import { useAttemptOptions } from '~~/lib/use-attempt-options'
import type { CompositionChallenge } from '~~/types/challenges/group-modes.type'
import type { Game, GameDifficulty, Round } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

const game = (difficulty: GameDifficulty) =>
  ({
    regions: [],
    difficulty,
    rounds: [{}],
    players: { a: { phase: 'group-challenge' } },
  }) as unknown as Game

const deal = async (difficulty: GameDifficulty) => {
  process.env.FORCE_ROUND_TYPE = 'composition'
  return (await getRoundChallenge({ game: game(difficulty) })) as CompositionChallenge
}

afterEach(() => {
  delete process.env.FORCE_ROUND_TYPE
})

describe('compositionBoards', () => {
  const pool = Object.keys(COUNTRIES) as ISOCountryCode[]

  it('keeps only boards with a bar worth reading and a decisive leader', () => {
    for (const isoCode of compositionBoards(pool)) {
      const origins = corridorsToDestination(isoCode)
      expect(origins.length).toBeGreaterThanOrEqual(COMPOSITION_MIN_SLICES)
      const total = origins.reduce((sum, origin) => sum + origin.value.amount, 0)
      expect(total).toBeGreaterThanOrEqual(COMPOSITION_MIN_TOTAL)
      expect(corridorMargin(origins)).toBeGreaterThanOrEqual(COMPOSITION_MIN_MARGIN)
    }
  })

  it('drops the boards where naming the largest origin is a coin-flip', () => {
    // The Netherlands (Poland vs Türkiye) and Canada (India vs the
    // Philippines) sit inside a rounding error of each other — asking for the
    // largest there would teach a guess as a fact
    const boards = compositionBoards(pool)
    for (const isoCode of ['NL', 'CA'] as ISOCountryCode[]) {
      expect(corridorMargin(corridorsToDestination(isoCode))).toBeLessThan(COMPOSITION_MIN_MARGIN)
      expect(boards).not.toContain(isoCode)
    }
  })

  it('leaves the mode well stocked on the world board', () => {
    // A migration regeneration that half-parses still type-checks; this is
    // what catches the dealer quietly starving
    expect(compositionBoards(pool).length).toBeGreaterThanOrEqual(60)
  })
})

describe('getCompositionChallenge (via getRoundChallenge)', () => {
  it('deals a sorted bar whose shares never exceed the whole', async () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const challenge = await deal(difficulty)
      expect(challenge._type).toBe('composition-challenge')
      expect(challenge.slices.length).toBeGreaterThanOrEqual(COMPOSITION_MIN_SLICES)

      const shares = challenge.slices.map(slice => slice.share)
      expect([...shares].sort((a, b) => b - a)).toEqual(shares)
      // Shares are of the country's whole foreign-born population, so the
      // listed head sums to less than 1 — the rest is the long tail. The
      // generator rounds each share to 4 decimals independently, so a board
      // whose origins nearly exhaust its population can land a hair over
      // (Nepal and Rwanda both reach 1.0001); the bar clamps its tail at 0.
      expect(shares.reduce((sum, share) => sum + share, 0)).toBeLessThanOrEqual(1.001)
      expect(new Set(challenge.slices.map(slice => slice.isoCode)).size).toBe(
        challenge.slices.length
      )
    }
  })

  it('offers the bar as an option table below hard, and free-types on hard', async () => {
    for (const difficulty of ['easy', 'normal'] as const) {
      const challenge = await deal(difficulty)
      expect(challenge.options).toBeDefined()
      expect(challenge.maximumGuesses).toBe(2)
      // Every slice is offered, so the answer is on screen and the question is
      // which one leads
      expect([...challenge.options!].sort()).toEqual(
        [...challenge.slices.map(slice => slice.isoCode)].sort()
      )
    }
    const hard = await deal('hard')
    expect(hard.options).toBeUndefined()
    expect(hard.maximumGuesses).toBeUndefined()
  })

  it('never deals a board whose leader is not decisive', async () => {
    const boards = new Set(compositionBoards(Object.keys(COUNTRIES) as ISOCountryCode[]))
    for (let round = 0; round < 25; round++) {
      const challenge = await deal('hard')
      expect(boards).toContain(challenge.country)
      expect(corridorMargin(corridorsToDestination(challenge.country))).toBeGreaterThanOrEqual(
        COMPOSITION_MIN_MARGIN
      )
    }
  })

  it('scales the board by difficulty, not just the console', async () => {
    // The option table is always the bar's own origins, so it cannot narrow
    // with difficulty — the board carries the scaling instead. Without this,
    // easy and normal dealt identical rounds.
    //
    // Asserted as pool composition, not as an ordering of medians: normal is
    // an untiered shuffle of every board, so its median sits near hard's and
    // the two cross by chance often enough to make that flaky (~4% per run).
    // What the tiering actually guarantees is which boards each end can draw.
    const blowoutShare = async (difficulty: GameDifficulty) => {
      let clear = 0
      for (let round = 0; round < 40; round++) {
        const challenge = await deal(difficulty)
        if (corridorMargin(corridorsToDestination(challenge.country)) >= COMPOSITION_CLEAR_MARGIN) {
          clear++
        }
      }
      return clear / 40
    }

    // Easy draws blowouts exclusively — the shape answers before the names do
    expect(await blowoutShare('easy')).toBe(1)
    // …and hard exhausts the close boards before it ever reaches one
    expect(await blowoutShare('hard')).toBe(0)
  })

  it('never puts the country on its own bar', async () => {
    for (let round = 0; round < 25; round++) {
      const challenge = await deal('normal')
      expect(challenge.slices.map(slice => slice.isoCode)).not.toContain(challenge.country)
    }
  })
})

describe('composition grading', () => {
  const MAX = 15
  const board = {
    _type: 'composition-challenge',
    country: 'DE',
    slices: [
      { isoCode: 'PL', share: 0.3 },
      { isoCode: 'TR', share: 0.2 },
      { isoCode: 'RO', share: 0.1 },
      { isoCode: 'IT', share: 0.05 },
    ],
    durationSeconds: 30,
    maximumPoints: MAX,
  } as const
  const grade = (
    challenge: Partial<CompositionChallenge>,
    ranking: ISOCountryCode[],
    clientScore = MAX,
    absent = false
  ) =>
    gradeGroupAnswer({
      game: {} as Game,
      round: {
        groupChallenge: { ...board, ...challenge },
        groupAnswers: {},
        playerTurns: {},
      } as unknown as Round,
      playerId: 'p',
      submission: { ranking, clientScore },
      absent,
    })
  const options = { options: ['IT', 'RO', 'TR', 'PL'] as ISOCountryCode[], maximumGuesses: 2 }

  it('pays nothing for mashing every card of a dealt board, early on the clock', async () => {
    for (const difficulty of ['easy', 'normal'] as const) {
      const challenge = await deal(difficulty)
      const largestOrigin = challenge.slices[0]!.isoCode
      const submitted = ref(false)
      const banked: { score: number; picks: ISOCountryCode[] }[] = []
      const { onGuess } = useAttemptOptions({
        challenge: computed(() => ({ ...challenge, answer: largestOrigin })),
        submitted,
        started: ref(true),
        remainingFraction: computed(() => 0.93),
        announce: () => {},
        submitRound: (score, picks) => {
          banked.push({ score, picks })
          submitted.value = true
        },
      })
      const mash = [...challenge.options!.filter(option => option !== largestOrigin), largestOrigin]
      for (const option of mash) onGuess(getCountry(option))

      expect(banked).toHaveLength(1)
      expect(banked[0]!.score).toBe(0)
      const { scoring } = await gradeGroupAnswer({
        game: {} as Game,
        round: { groupChallenge: challenge, groupAnswers: {}, playerTurns: {} } as unknown as Round,
        playerId: 'p',
        submission: { ranking: banked[0]!.picks, clientScore: banked[0]!.score },
      })
      expect(scoring.scored).toBe(0)
    }
  })

  it('prices the picks by attempt, not the claimed score', async () => {
    expect((await grade(options, ['PL'], 1)).scoring.scored).toBe(MAX)
    expect((await grade(options, ['TR', 'PL'])).scoring.scored).toBe(capitalGuessScore(2, 2, MAX))
    expect((await grade(options, ['TR', 'RO'])).scoring.scored).toBe(0)
  })

  it('zeroes an absent seat but still reports the largest origin', async () => {
    const { scoring, answer } = await grade(options, [], MAX, true)
    expect(scoring.scored).toBe(0)
    expect(answer.correct).toEqual(['PL'])
  })

  it('still grades the free-typed hard board as a buzz on the largest origin', async () => {
    expect((await grade({}, ['PL'], 9)).scoring.scored).toBe(9)
    expect((await grade({}, ['TR'], 9)).scoring.scored).toBe(0)
  })
})
