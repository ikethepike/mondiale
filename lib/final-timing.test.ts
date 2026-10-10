import { describe, expect, it } from 'vitest'
import {
  FINAL_STAGE_LEAD_MS,
  finalClockDeadline,
  finalInterstitialEndsAt,
  finalQuestionDeadline,
  finalQuestionNumber,
} from '~~/lib/final-timing'
import { INTERSTITIAL_TOTAL_MS } from '~~/lib/round-beats'
import type { FinalChallengeItem } from '~~/types/challenges/final-challenge.type'

const AT = 1_000_000
const NOCTURNE = {
  _type: 'city-nocturne-challenge',
  durationSeconds: 40,
} as unknown as FinalChallengeItem
const REGION = { _type: 'region-challenge' } as unknown as FinalChallengeItem

describe('the gauntlet stage clock', () => {
  it('the first question waits out the full card; a release counts from the tap', () => {
    expect(finalQuestionDeadline(NOCTURNE, 'normal', AT, true)).toBe(
      AT + INTERSTITIAL_TOTAL_MS + FINAL_STAGE_LEAD_MS + 40_000
    )
    expect(finalQuestionDeadline(NOCTURNE, 'normal', AT, false)).toBe(
      AT + FINAL_STAGE_LEAD_MS + 40_000
    )
    expect(finalClockDeadline(NOCTURNE, 'normal', AT)).toBe(AT + FINAL_STAGE_LEAD_MS + 40_000)
    expect(finalClockDeadline(REGION, 'normal', AT)).toBeUndefined()
  })

  it('the opening card is spent where its stage clock was released', () => {
    const landed = { enteredAt: AT, deadline: finalQuestionDeadline(NOCTURNE, 'normal', AT, true) }
    expect(finalInterstitialEndsAt(NOCTURNE, 'normal', landed)).toBe(AT + INTERSTITIAL_TOTAL_MS)
    const tapped = { enteredAt: AT, deadline: finalClockDeadline(NOCTURNE, 'normal', AT + 700) }
    expect(finalInterstitialEndsAt(NOCTURNE, 'normal', tapped)).toBe(AT + 700)
    expect(finalInterstitialEndsAt(REGION, 'normal', { enteredAt: AT })).toBe(
      AT + INTERSTITIAL_TOTAL_MS
    )
  })
})

describe('finalQuestionNumber', () => {
  it('counts the question on screen, not the questions left', () => {
    expect(finalQuestionNumber({ turn: undefined, totalCount: 10 })).toBe(1)
    expect(finalQuestionNumber({ turn: 4, totalCount: 10 })).toBe(5)
  })

  it('a missed last question keeps its place through the hold and its replacement', () => {
    // The verdict's save pushes the replacement; the turn only moves on after the hold.
    expect(finalQuestionNumber({ turn: 9, totalCount: 10 })).toBe(10)
    expect(finalQuestionNumber({ turn: 10, totalCount: 10 })).toBe(10)
    expect(finalQuestionNumber({ turn: 13, totalCount: 10 })).toBe(10)
  })
})
