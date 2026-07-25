import { afterEach, describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { getIndividualChallenge } from '~~/lib/challenges'
import { processReplacements } from '~~/lib/values'
import {
  individualChallengeAccessors,
  individualChallengeVariants,
} from '~~/types/challenges/individual-challenge.type'

afterEach(() => {
  delete process.env.FORCE_INDIVIDUAL_VARIANT
})

describe('getIndividualChallenge (gate accessors)', () => {
  it('deals a valid challenge for every gate accessor', () => {
    for (const accessorId of individualChallengeAccessors) {
      for (let attempt = 0; attempt < 15; attempt++) {
        const dealt = getIndividualChallenge({ accessorId, difficulty: 'normal', variant: 'world' })
        expect(dealt._type).toBe('individual-challenge')
        expect(dealt.id).toBe(accessorId)
        expect(dealt.country in COUNTRIES).toBe(true)
        expect(individualChallengeVariants).toContain(dealt.variant)
      }
    }
  })

  it('keeps the find fallback answerable on the themed gates', () => {
    // The find phrasing quotes the country's leader/currency, so the dealt
    // subject must actually carry one.
    process.env.FORCE_INDIVIDUAL_VARIANT = 'find'
    for (let attempt = 0; attempt < 25; attempt++) {
      const leaderGate = getIndividualChallenge({ accessorId: 'government.leader' })
      expect(COUNTRIES[leaderGate.country].government.leader).toBeTruthy()

      const currencyGate = getIndividualChallenge({ accessorId: 'currency' })
      expect(COUNTRIES[currencyGate.country].currency).toBeTruthy()
    }
  })

  it('fills the {leader} and {currency} phrasing tokens', () => {
    process.env.FORCE_INDIVIDUAL_VARIANT = 'find'
    const leaderGate = getIndividualChallenge({ accessorId: 'government.leader' })
    const leaderQuestion = processReplacements('Which country is led by {leader}?', leaderGate.country)
    expect(leaderQuestion).not.toContain('{leader}')
    expect(leaderQuestion.length).toBeGreaterThan('Which country is led by ?'.length)

    const currencyGate = getIndividualChallenge({ accessorId: 'currency' })
    const currencyQuestion = processReplacements(
      'Which country spends the {currency}?',
      currencyGate.country
    )
    expect(currencyQuestion).not.toContain('{currency}')
    expect(currencyQuestion.length).toBeGreaterThan('Which country spends the ?'.length)
  })
})
