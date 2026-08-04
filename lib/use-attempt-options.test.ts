import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'
import { getCountry } from '~~/lib/country'
import { useAttemptOptions } from '~~/lib/use-attempt-options'
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
  const wrong: ISOCountryCode[] = []
  const { spent, onGuess } = useAttemptOptions({
    challenge: computed(() => challengeValue),
    submitted,
    started: ref(true),
    remainingFraction: computed(() => 1),
    announce: entry => wrong.push(entry.isoCode),
    submitRound: score => {
      scores.push(score)
      submitted.value = true
    },
  })
  return { spent, onGuess, scores, wrong }
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
})
