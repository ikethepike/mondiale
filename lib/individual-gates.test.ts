import { afterEach, describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { getIndividualChallenge, isCorrectIndividualAnswer } from '~~/lib/challenges'
import { countryLedBy } from '~~/lib/leaders'
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
    const leaderQuestion = processReplacements(
      'Which country is led by {leader}?',
      leaderGate.country
    )
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

describe('dealLeaderPortrait (via forced variant)', () => {
  it('never offers two countries the pictured leader leads', () => {
    // Shared leaders are real: Charles III reigns over 14 realms and Macron
    // co-rules Andorra — a portrait's decoys must all be led by someone else.
    process.env.FORCE_INDIVIDUAL_VARIANT = 'leader-portrait'
    for (let attempt = 0; attempt < 40; attempt++) {
      const dealt = getIndividualChallenge({ accessorId: 'government.leader' })
      if (dealt.variant !== 'leader-portrait' || !dealt.options || !dealt.portrait) continue
      const led = dealt.options.filter(isoCode => countryLedBy(isoCode, dealt.portrait!.name))
      expect(led).toEqual([dealt.country])
    }
  })
})

describe('isCorrectIndividualAnswer', () => {
  it('accepts any country spending the shared currency on the find gate', () => {
    const gate = { id: 'currency', country: 'FI', variant: 'find' } as const
    expect(COUNTRIES.FI.currency).toBe('EUR')
    expect(COUNTRIES.DE.currency).toBe('EUR')
    expect(isCorrectIndividualAnswer(gate, 'DE')).toBe(true)
    expect(isCorrectIndividualAnswer(gate, 'FI')).toBe(true)
    expect(isCorrectIndividualAnswer(gate, 'NO')).toBe(false)
  })

  it('accepts a same-currency country on money-match', () => {
    const gate = { id: 'capital.name', country: 'FR', variant: 'money-match' } as const
    expect(isCorrectIndividualAnswer(gate, 'ES')).toBe(true)
    expect(isCorrectIndividualAnswer(gate, 'CH')).toBe(false)
  })

  it('stays strict for every non-currency question', () => {
    // Two euro countries — a shared currency must not leak into e.g. a flag
    // or higher-lower verdict.
    expect(isCorrectIndividualAnswer({ id: 'flag', country: 'FI', variant: 'find' }, 'DE')).toBe(
      false
    )
    expect(
      isCorrectIndividualAnswer({ id: 'currency', country: 'FI', variant: 'higher-lower' }, 'DE')
    ).toBe(false)
    expect(isCorrectIndividualAnswer({ id: 'flag', country: 'FI', variant: 'find' }, 'FI')).toBe(
      true
    )
  })
})
