import { afterEach, describe, expect, it } from 'vitest'
import { BORDERS } from '~~/data/borders.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { MAP_BOUNDS } from '~~/data/map.gen'
import { getIndividualChallenge, isCorrectIndividualAnswer } from '~~/lib/challenges'
import { countryName } from '~~/lib/country'
import { playableCountries } from '~~/lib/game-rules'
import { isLabelableBox } from '~~/lib/geo'
import { gameDifficulties, type GameDifficulty } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

afterEach(() => {
  delete process.env.FORCE_INDIVIDUAL_VARIANT
})

const dealErrata = async (difficulty: GameDifficulty = 'normal') => {
  process.env.FORCE_INDIVIDUAL_VARIANT = 'errata'
  const dealt = await getIndividualChallenge({ accessorId: 'isoCode', difficulty })
  expect(dealt.variant, 'errata failed to deal and fell back').toBe('errata')
  const errata = dealt.errata
  if (!errata) throw new Error('dealt errata with no payload')
  return { dealt, errata }
}

describe('dealErrata', () => {
  it('deals a connected, labelable lineup on every difficulty', async () => {
    for (const difficulty of gameDifficulties) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const { errata } = await dealErrata(difficulty)
        const inPlay = new Set(playableCountries({ difficulty, variant: 'world' }))

        expect(errata.lineup.length).toBeGreaterThanOrEqual(5)
        expect(new Set(errata.lineup).size).toBe(errata.lineup.length)

        for (const isoCode of errata.lineup) {
          expect(inPlay.has(isoCode), `${isoCode} is benched`).toBe(true)
          // A member the renderer would skip is a hole in the question.
          expect(isLabelableBox(MAP_BOUNDS[isoCode]), `${isoCode} can't carry a label`).toBe(true)
        }

        // Every member past the seed reaches the stage over a land border.
        const stage = new Set(errata.lineup)
        for (const isoCode of errata.lineup.slice(1)) {
          const touches = (BORDERS[isoCode] ?? []).some(other => stage.has(other))
          expect(touches, `${isoCode} floats off the stage`).toBe(true)
        }
      }
    }
  })

  it('labels every member, and mislabels exactly the culprits', async () => {
    for (const difficulty of gameDifficulties) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const { errata } = await dealErrata(difficulty)

        const labelled = Object.keys(errata.labels) as ISOCountryCode[]
        expect(new Set(labelled)).toEqual(new Set(errata.lineup))

        const wrong = errata.lineup.filter(
          isoCode => errata.labels[isoCode] !== countryName(isoCode)
        )
        expect(new Set(wrong)).toEqual(new Set(errata.culprits))
        expect(errata.culprits.length).toBe(errata.kind === 'swap' ? 2 : 1)
      }
    }
  })

  it('swaps two countries that actually border each other', async () => {
    for (let attempt = 0; attempt < 15; attempt++) {
      const { errata } = await dealErrata('hard')
      expect(errata.kind).toBe('swap')
      const [first, second] = errata.culprits
      expect(BORDERS[first]).toContain(second)
      // Each wears the other's name — that's what makes it a swap.
      expect(errata.labels[first]).toBe(countryName(second))
      expect(errata.labels[second]).toBe(countryName(first))
    }
  })

  it('gives the impostor a name from off the stage', async () => {
    for (const difficulty of ['easy', 'normal'] as const) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const { errata } = await dealErrata(difficulty)
        expect(errata.kind).toBe('impostor')
        const [victim] = errata.culprits
        const borrowed = errata.labels[victim]
        const onStage = errata.lineup.map(countryName)
        expect(onStage).not.toContain(borrowed)
        // It is still a real country's name, not an invention.
        expect(Object.values(COUNTRIES).some(country => country.name.english === borrowed)).toBe(
          true
        )
      }
    }
  })

  it('accepts either swapped country and refuses the innocent ones', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const { dealt, errata } = await dealErrata('hard')
      for (const culprit of errata.culprits) {
        expect(isCorrectIndividualAnswer(dealt, culprit)).toBe(true)
      }
      for (const innocent of errata.lineup.filter(iso => !errata.culprits.includes(iso))) {
        expect(isCorrectIndividualAnswer(dealt, innocent)).toBe(false)
      }
    }
  })
})
