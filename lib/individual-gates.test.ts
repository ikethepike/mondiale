import { afterEach, describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { ATLAS_TARGET_LINKS, hasAtlasChain } from '~~/lib/atlas-chain'
import { getIndividualChallenge, isCorrectIndividualAnswer } from '~~/lib/challenges'
import { countryLedBy } from '~~/lib/leaders'
import { processReplacements } from '~~/lib/values'
import {
  individualChallengeAccessors,
  individualChallengeVariants,
} from '~~/types/challenges/individual-challenge.type'
import { ORGANIZATION_FACTS, OrganizationVector } from '~~/types/organization.type'

afterEach(() => {
  delete process.env.FORCE_INDIVIDUAL_VARIANT
})

describe('getIndividualChallenge (gate accessors)', () => {
  it('deals a valid challenge for every gate accessor', async () => {
    for (const accessorId of individualChallengeAccessors) {
      for (let attempt = 0; attempt < 15; attempt++) {
        const dealt = await getIndividualChallenge({
          accessorId,
          difficulty: 'normal',
          variant: 'world',
        })
        expect(dealt._type).toBe('individual-challenge')
        expect(dealt.id).toBe(accessorId)
        expect(dealt.country in COUNTRIES).toBe(true)
        expect(individualChallengeVariants).toContain(dealt.variant)
      }
    }
  })

  it('keeps the find fallback answerable on the themed gates', async () => {
    // The find phrasing quotes the country's leader/currency, so the dealt
    // subject must actually carry one.
    process.env.FORCE_INDIVIDUAL_VARIANT = 'find'
    for (let attempt = 0; attempt < 25; attempt++) {
      const leaderGate = await getIndividualChallenge({ accessorId: 'government.leader' })
      expect(COUNTRIES[leaderGate.country].government.leader).toBeTruthy()

      const currencyGate = await getIndividualChallenge({ accessorId: 'currency' })
      expect(COUNTRIES[currencyGate.country].currency).toBeTruthy()
    }
  })

  it('fills the {leader} and {currency} phrasing tokens', async () => {
    process.env.FORCE_INDIVIDUAL_VARIANT = 'find'
    const leaderGate = await getIndividualChallenge({ accessorId: 'government.leader' })
    const leaderQuestion = processReplacements(
      'Which country is led by {leader}?',
      leaderGate.country
    )
    expect(leaderQuestion).not.toContain('{leader}')
    expect(leaderQuestion.length).toBeGreaterThan('Which country is led by ?'.length)

    const currencyGate = await getIndividualChallenge({ accessorId: 'currency' })
    const currencyQuestion = processReplacements(
      'Which country spends the {currency}?',
      currencyGate.country
    )
    expect(currencyQuestion).not.toContain('{currency}')
    expect(currencyQuestion.length).toBeGreaterThan('Which country spends the ?'.length)
  })
})

describe('dealLeaderPortrait (via forced variant)', () => {
  it('never offers two countries the pictured leader leads', async () => {
    // Shared leaders are real: Charles III reigns over 14 realms and Macron
    // co-rules Andorra — a portrait's decoys must all be led by someone else.
    process.env.FORCE_INDIVIDUAL_VARIANT = 'leader-portrait'
    for (let attempt = 0; attempt < 40; attempt++) {
      const dealt = await getIndividualChallenge({ accessorId: 'government.leader' })
      if (dealt.variant !== 'leader-portrait' || !dealt.options || !dealt.portrait) continue
      const led = dealt.options.filter(isoCode => countryLedBy(isoCode, dealt.portrait!.name))
      expect(led).toEqual([dealt.country])
    }
  })
})

describe('isCorrectIndividualAnswer', () => {
  it('accepts any country spending the shared currency on the find gate', async () => {
    const gate = { id: 'currency', country: 'FI', variant: 'find' } as const
    expect(COUNTRIES.FI.currency).toBe('EUR')
    expect(COUNTRIES.DE.currency).toBe('EUR')
    expect(isCorrectIndividualAnswer(gate, 'DE')).toBe(true)
    expect(isCorrectIndividualAnswer(gate, 'FI')).toBe(true)
    expect(isCorrectIndividualAnswer(gate, 'NO')).toBe(false)
  })

  it('accepts a same-currency country on money-match', async () => {
    const gate = { id: 'capital.name', country: 'FR', variant: 'money-match' } as const
    expect(isCorrectIndividualAnswer(gate, 'ES')).toBe(true)
    expect(isCorrectIndividualAnswer(gate, 'CH')).toBe(false)
  })

  it('stays strict for every non-currency question', async () => {
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

describe('dealOddOneOut (via forced variant)', () => {
  it('names a club the way a sentence would, not the way the enum does', async () => {
    // The gate used to read the club's formal name straight off the country's
    // membership entry, with one hardcoded exception for NATO — so it asked
    // about "Organisation for Economic Co-operation and Development" where a
    // person would say "the OECD". ORGANIZATION_FACTS is the one home for that.
    // Alliances are a hard-mode register — the other difficulties ask about
    // region and language only.
    process.env.FORCE_INDIVIDUAL_VARIANT = 'odd-one-out'
    const shorthands = Object.values(ORGANIZATION_FACTS).map(facts => facts.shortName)
    const formal = Object.values(OrganizationVector)

    let sawOrganization = false
    for (let attempt = 0; attempt < 60; attempt++) {
      const dealt = await getIndividualChallenge({ accessorId: 'isoCode', difficulty: 'hard' })
      if (dealt.oddOneOut?.kind !== 'organization') continue
      sawOrganization = true
      const { value, propertyLabel } = dealt.oddOneOut
      expect(shorthands, `dealt "${value}"`).toContain(value)
      expect(propertyLabel).toBe(`Three of these are members of ${value}`)
      // A formal name reaching the prompt is the bug — but some shorthands
      // ARE the formal name ("NATO") or contain it ("the African Union"), so
      // only the ones that genuinely differ can be checked this way.
      for (const name of formal) {
        if (shorthands.some(short => short.includes(name))) continue
        expect(propertyLabel, `formal name leaked: ${name}`).not.toContain(name)
      }
    }
    expect(sawOrganization, 'no organization question was dealt — test is vacuous').toBe(true)
  })
})

describe('atlas gate dealing', () => {
  it('deals a solvable chain for every difficulty', async () => {
    process.env.FORCE_INDIVIDUAL_VARIANT = 'atlas'
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const dealt = await getIndividualChallenge({ accessorId: 'lexicon', difficulty })
        expect(dealt.variant).toBe('atlas')
        expect(dealt.atlas?.seed).toBe(dealt.country)
        expect(dealt.atlas?.overlaps).toBe(difficulty === 'hard')
        const target = dealt.atlas?.target ?? 0
        expect(target).toBe(ATLAS_TARGET_LINKS[difficulty])
        // The guard's promise: the target is reachable under the plain rule.
        expect(hasAtlasChain(dealt.country, target, [...ISOCountryCodes])).toBe(true)
      }
    }
  })
})
