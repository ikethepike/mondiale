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

const harness = (challengeValue: {
  country: ISOCountryCode
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
  it('scores the subject (capital-guess)', () => {
    const { onGuess, scores } = harness({ country: 'FR', maximumGuesses: 2, maximumPoints: 100 })
    onGuess(getCountry('FR'))
    expect(scores).toHaveLength(1)
    expect(scores[0]).toBeGreaterThan(0)
  })

  it('spends the cap on wrong picks and fails out at zero', () => {
    const { onGuess, scores, spent } = harness({
      country: 'PL',
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
    const first = harness({ country: 'PL', maximumGuesses: 3, maximumPoints: 100 })
    first.onGuess(getCountry('PL'))

    const second = harness({ country: 'PL', maximumGuesses: 3, maximumPoints: 100 })
    second.onGuess(getCountry('TR'))
    second.onGuess(getCountry('PL'))

    expect(second.scores[0]).toBeLessThan(first.scores[0])
    expect(second.scores[0]).toBeGreaterThan(0)
  })

  it('banks the attempt sequence the server prices, at the score it prices', () => {
    const won = harness({ country: 'PL', maximumGuesses: 2, maximumPoints: 15 })
    won.onGuess(getCountry('TR'))
    won.onGuess(getCountry('PL'))
    expect(won.picks).toEqual([['TR', 'PL']])
    expect(won.scores).toEqual([attemptPicksScore(['TR', 'PL'], 'PL', 2, 15)])

    const lost = harness({ country: 'PL', maximumGuesses: 2, maximumPoints: 15 })
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

  it('lists the country as found only where a city of the picks scored', async () => {
    expect((await grade(['Houston', 'Chicago'])).answer).toEqual({
      submitted: ['US'],
      correct: ['US'],
    })
    expect((await grade(['Houston', 'Toronto'])).answer).toEqual({
      submitted: [],
      correct: ['US'],
    })
  })

  it('zeroes a malformed pick list instead of throwing', async () => {
    expect((await grade('Chicago')).scoring.scored).toBe(0)
    expect((await grade([7, 'Chicago'])).scoring.scored).toBe(capitalGuessScore(2, 2, 20))
  })
})

describe('useAttemptOptions against the server record', () => {
  const flush = () => new Promise(resolve => setTimeout(resolve, 0))
  const board = (recordedPicks: string[], land: (pick: string) => Promise<boolean>) => {
    const submitted = ref(false)
    const scores: number[] = []
    const announced: string[] = []
    const recorded = ref<string[]>(recordedPicks)
    const machine = useAttemptOptions({
      challenge: computed(() => ({
        country: 'JP' as ISOCountryCode,
        maximumGuesses: 2,
        maximumPoints: 100,
      })),
      submitted,
      started: ref(true),
      remainingFraction: computed(() => 1),
      announce: entry => announced.push(entry.isoCode),
      recorded: computed(() => recorded.value),
      record: pick =>
        land(pick).then(landed => {
          if (landed) recorded.value = [...recorded.value, pick]
          return landed
        }),
      submitRound: score => {
        scores.push(score)
        submitted.value = true
      },
    })
    return { ...machine, scores, announced, recorded }
  }

  it("restores the server's spent picks instead of handing the guesses back", async () => {
    const { spent, attemptsLeft, onGuess, scores } = board(['NE'], async () => true)
    expect(spent.value).toEqual(['NE'])
    expect(attemptsLeft.value).toBe(1)
    onGuess(getCountry('JP'))
    await flush()
    expect(scores).toEqual([capitalGuessScore(2, 2, 100)])
  })

  it('records every pick before judging it, right and wrong alike', async () => {
    const { onGuess, recorded, announced, scores, spent } = board([], async () => true)
    onGuess(getCountry('QA'))
    expect(announced).toEqual([])
    await flush()
    expect(spent.value).toEqual(['QA'])
    onGuess(getCountry('JP'))
    expect(scores).toEqual([])
    await flush()
    expect(recorded.value).toEqual(['QA', 'JP'])
    expect(scores).toEqual([capitalGuessScore(2, 2, 100)])
  })

  it('shows nothing for a pick the server never holds', async () => {
    const { onGuess, pending, announced, spent } = board([], () => new Promise(() => {}))
    onGuess(getCountry('QA'))
    await flush()
    expect(pending.value).toBe('QA')
    expect(announced).toEqual([])
    expect(spent.value).toEqual([])
  })

  it('lets a pick the server refused be tried again', async () => {
    const { onGuess, pending, spent } = board([], async () => false)
    onGuess(getCountry('QA'))
    await flush()
    expect(pending.value).toBeUndefined()
    expect(spent.value).toEqual([])
  })

  it('finishes a reloaded round whose answer the server already holds', () => {
    const { scores, spent } = board(['NE', 'JP'], async () => true)
    expect(scores).toEqual([capitalGuessScore(2, 2, 100)])
    expect(spent.value).toEqual(['NE'])
  })
})
