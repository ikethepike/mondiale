import { afterEach, describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { getIndividualChallenge, isCorrectIndividualAnswer } from '~~/lib/challenges'
import { mentionsCountry } from '~~/lib/country'
import { ROSETTA_RELATIONS, rosettaRelationIds, rosettaTerms } from '~~/lib/rosetta'
import { normalizeAnswer } from '~~/lib/strings'
import { individualChallengeAccessors } from '~~/types/challenges/individual-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

const WORLD: ISOCountryCode[] = [...ISOCountryCodes]

afterEach(() => {
  delete process.env.FORCE_INDIVIDUAL_VARIANT
})

describe('rosettaTerms', () => {
  it('yields a workable pool for every relation', () => {
    for (const relation of rosettaRelationIds) {
      // Currency is the thin one — most currency names carry their country's
      // adjective and the scrub eats them. It still has to be dealable.
      expect(rosettaTerms(relation, WORLD).length, relation).toBeGreaterThan(20)
    }
  })

  it('only yields terms that point at exactly one country', () => {
    for (const relation of rosettaRelationIds) {
      const { terms } = ROSETTA_RELATIONS[relation]
      const holders = new Map<string, Set<ISOCountryCode>>()
      for (const isoCode of WORLD) {
        for (const term of terms(isoCode)) {
          const key = normalizeAnswer(term)
          if (!key) continue
          ;(holders.get(key) ?? holders.set(key, new Set()).get(key)!).add(isoCode)
        }
      }
      for (const { isoCode, term } of rosettaTerms(relation, WORLD)) {
        expect([...(holders.get(normalizeAnswer(term)) ?? [])], `${relation}: ${term}`).toEqual([
          isoCode,
        ])
      }
    }
  })

  it('never yields a term that names its own country', () => {
    for (const relation of rosettaRelationIds) {
      for (const { isoCode, term } of rosettaTerms(relation, WORLD)) {
        expect(mentionsCountry(term, isoCode), `${relation}: "${term}" gives away ${isoCode}`).toBe(
          false
        )
      }
    }
  })
})

describe('dealRosetta', () => {
  it('deals a clean analogy from every gate theme', async () => {
    process.env.FORCE_INDIVIDUAL_VARIANT = 'rosetta'
    for (const accessorId of individualChallengeAccessors) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const dealt = await getIndividualChallenge({ accessorId, difficulty: 'normal' })
        expect(dealt.variant, `${accessorId} fell back`).toBe('rosetta')
        const rosetta = dealt.rosetta
        if (!rosetta) throw new Error('dealt rosetta with no payload')

        expect(rosettaRelationIds).toContain(rosetta.relation)
        expect(rosetta.relationLabel).toBe(ROSETTA_RELATIONS[rosetta.relation].label)

        // The exemplar demonstrates; it must not BE the question.
        expect(rosetta.exemplar.isoCode).not.toBe(dealt.country)
        expect(COUNTRIES[rosetta.exemplar.isoCode].region).not.toBe(COUNTRIES[dealt.country].region)

        // Neither side may answer itself.
        expect(mentionsCountry(rosetta.term, dealt.country)).toBe(false)
        expect(mentionsCountry(rosetta.exemplar.term, rosetta.exemplar.isoCode)).toBe(false)

        // Both terms really belong to the countries they're paired with.
        const supplied = (isoCode: ISOCountryCode) =>
          ROSETTA_RELATIONS[rosetta.relation].terms(isoCode)
        expect(supplied(dealt.country)).toContain(rosetta.term)
        expect(supplied(rosetta.exemplar.isoCode)).toContain(rosetta.exemplar.term)
      }
    }
  })

  it('honours the themed tiles register', async () => {
    process.env.FORCE_INDIVIDUAL_VARIANT = 'rosetta'
    const expected = {
      'capital.name': 'capital',
      currency: 'currency',
      'government.leader': 'leader',
      landmarks: 'landmark',
    } as const
    for (const [accessorId, relation] of Object.entries(expected)) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const dealt = await getIndividualChallenge({
          accessorId: accessorId as keyof typeof expected,
        })
        expect(dealt.rosetta?.relation, accessorId).toBe(relation)
      }
    }
  })

  it('grades on strict ISO equality — the term identifies one country', async () => {
    process.env.FORCE_INDIVIDUAL_VARIANT = 'rosetta'
    for (let attempt = 0; attempt < 10; attempt++) {
      const dealt = await getIndividualChallenge({ accessorId: 'isoCode' })
      expect(isCorrectIndividualAnswer(dealt, dealt.country)).toBe(true)
      expect(isCorrectIndividualAnswer(dealt, dealt.rosetta!.exemplar.isoCode)).toBe(false)
    }
  })
})
