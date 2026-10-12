import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'
import { attemptPicksScore, capitalGuessScore } from '~~/lib/challenges'
import { getCountry } from '~~/lib/country'
import { gradeGroupAnswer } from '~~/lib/events/server/grade-group-answer'
import { namesGroundPlanCity } from '~~/lib/ground-plan'
import { useAttemptOptions } from '~~/lib/use-attempt-options'
import type { GroundPlanChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The attempt machine grades against the ANSWER, which is not always the
 * round's subject. Composition asks about a board and answers with one of its
 * origins — and a board is never among its own options — so grading against
 * `country` there made the round structurally unwinnable.
 */
const harness = (challengeValue: {
  country: ISOCountryCode
  answer?: ISOCountryCode
  maximumGuesses?: number
  maximumPoints: number
}) => {
  const submitted = ref(false)
  const scores: number[] = []
  const picks: ISOCountryCode[][] = []
  const wrong: ISOCountryCode[] = []
  const { spent, onGuess } = useAttemptOptions({
    challenge: computed(() => challengeValue),
    submitted,
    started: ref(true),
    remainingFraction: computed(() => 1),
    announce: entry => wrong.push(entry.isoCode),
    submitRound: (score, attempt) => {
      scores.push(score)
      picks.push(attempt)
      submitted.value = true
    },
  })
  return { spent, onGuess, scores, picks, wrong }
}

describe('useAttemptOptions grading', () => {
  it('scores the subject when no separate answer is given (capital-guess)', () => {
    const { onGuess, scores } = harness({ country: 'FR', maximumGuesses: 2, maximumPoints: 100 })
    onGuess(getCountry('FR'))
    expect(scores).toHaveLength(1)
    expect(scores[0]).toBeGreaterThan(0)
  })

  it('scores the answer, not the subject, when they differ (composition)', () => {
    // Germany's bar: the board is DE, the largest origin is PL
    const { onGuess, scores } = harness({
      country: 'DE',
      answer: 'PL',
      maximumGuesses: 2,
      maximumPoints: 100,
    })
    onGuess(getCountry('PL'))
    expect(scores).toHaveLength(1)
    expect(scores[0]).toBeGreaterThan(0)
  })

  it('never lets the subject score when it is only the prompt', () => {
    // Tapping DE on Germany's own bar is a misread, not the answer — and it
    // is the name already printed above the bar, so it must not pay
    const { onGuess, scores, wrong } = harness({
      country: 'DE',
      answer: 'PL',
      maximumGuesses: 2,
      maximumPoints: 100,
    })
    onGuess(getCountry('DE'))
    expect(scores).toEqual([])
    expect(wrong).toEqual(['DE'])
  })

  it('spends the cap on wrong picks and fails out at zero', () => {
    const { onGuess, scores, spent } = harness({
      country: 'DE',
      answer: 'PL',
      maximumGuesses: 2,
      maximumPoints: 100,
    })
    onGuess(getCountry('TR'))
    expect(spent.value).toEqual(['TR'])
    expect(scores).toEqual([])
    onGuess(getCountry('RO'))
    expect(scores).toEqual([0])
  })

  it('pays a later attempt less than the first', () => {
    const first = harness({ country: 'DE', answer: 'PL', maximumGuesses: 3, maximumPoints: 100 })
    first.onGuess(getCountry('PL'))

    const second = harness({ country: 'DE', answer: 'PL', maximumGuesses: 3, maximumPoints: 100 })
    second.onGuess(getCountry('TR'))
    second.onGuess(getCountry('PL'))

    expect(second.scores[0]).toBeLessThan(first.scores[0])
    expect(second.scores[0]).toBeGreaterThan(0)
  })

  it('banks the attempt sequence the server prices, at the score it prices', () => {
    const won = harness({ country: 'DE', answer: 'PL', maximumGuesses: 2, maximumPoints: 15 })
    won.onGuess(getCountry('TR'))
    won.onGuess(getCountry('PL'))
    expect(won.picks).toEqual([['TR', 'PL']])
    expect(won.scores).toEqual([attemptPicksScore(['TR', 'PL'], 'PL', 2, 15)])

    const lost = harness({ country: 'DE', answer: 'PL', maximumGuesses: 2, maximumPoints: 15 })
    lost.onGuess(getCountry('TR'))
    lost.onGuess(getCountry('RO'))
    expect(lost.picks).toEqual([['TR', 'RO']])
    expect(lost.scores).toEqual([0])
  })
})

describe('useAttemptOptions named picks', () => {
  const CHICAGO: GroundPlanChallenge = {
    _type: 'ground-plan-challenge',
    country: 'US',
    city: 'Chicago',
    cut: { slug: 'chicago-loop', signature: true },
    crossings: 0,
    layers: ['fabric'],
    secondsPerLayer: 5,
    secondsPerHint: 5,
    options: ['Houston', 'Chicago', 'Toronto', 'Lima'],
    maximumGuesses: 2,
    durationSeconds: 30,
    maximumPoints: 20,
  }

  const play = (taps: string[]) => {
    const submitted = ref(false)
    const banked: { score: number; picks: string[] }[] = []
    const { onGuess, spent } = useAttemptOptions({
      challenge: computed(() => CHICAGO),
      submitted,
      started: ref(true),
      remainingFraction: computed(() => 1),
      announce: () => {},
      namesAnswer: (city: string) => namesGroundPlanCity(CHICAGO, city),
      submitRound: (score, picks) => {
        banked.push({ score, picks })
        submitted.value = true
      },
    })
    for (const city of taps) onGuess(getCountry(city === 'Toronto' ? 'CA' : 'US'), city)
    return { banked, spent }
  }

  const grade = (picks: unknown) =>
    gradeGroupAnswer({
      game: { difficulty: 'normal' } as Game,
      round: { groupChallenge: CHICAGO, groupAnswers: {}, playerTurns: {} } as never,
      playerId: 'p',
      submission: { ranking: ['US'], cities: picks as string[] },
    })

  it('spends a wrong city of the right country as a miss', () => {
    const { banked, spent } = play(['Houston'])
    expect(banked).toEqual([])
    expect(spent.value).toEqual(['Houston'])
  })

  it('prices the attempt that named the dealt city, on both ends of the wire', async () => {
    for (const [taps, attempt] of [
      [['Chicago'], 1],
      [['Houston', 'Chicago'], 2],
    ] as const) {
      const { banked } = play([...taps])
      expect(banked).toEqual([{ score: capitalGuessScore(attempt, 2, 20), picks: taps }])
      expect((await grade(banked[0]!.picks)).scoring.scored).toBe(banked[0]!.score)
    }
  })

  it('pays nothing once the cap is spent on the wrong cities', async () => {
    const { banked } = play(['Houston', 'Toronto', 'Chicago'])
    expect(banked).toEqual([{ score: 0, picks: ['Houston', 'Toronto'] }])
    expect((await grade(['Houston', 'Toronto', 'Chicago'])).scoring.scored).toBe(0)
  })

  it('zeroes a malformed pick list instead of throwing', async () => {
    expect((await grade('Chicago')).scoring.scored).toBe(0)
    expect((await grade([7, 'Chicago'])).scoring.scored).toBe(capitalGuessScore(2, 2, 20))
  })
})
