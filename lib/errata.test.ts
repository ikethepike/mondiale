import { afterEach, describe, expect, it } from 'vitest'
import { BORDERS } from '~~/data/borders.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { MAP_BOUNDS, MAP_PATHS, MAP_REGIONS } from '~~/data/map.gen'
import { getIndividualChallenge, isCorrectIndividualAnswer } from '~~/lib/challenges'
import { countryName } from '~~/lib/country'
import { playableCountries } from '~~/lib/game-rules'
import { isLabelableBox, labelBoxFor } from '~~/lib/geo'
import { largestRing, poleOfInaccessibility, ringContains } from '~~/lib/outline'
import { wrongTokenFor } from '~~/lib/use-gate-challenge'
import { gameDifficulties, type GameDifficulty } from '~~/types/game.types'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
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
          // A member the renderer would skip is a hole in the question — and
          // it judges the box it can POINT at, not the whole-country bbox.
          const box = labelBoxFor(MAP_BOUNDS[isoCode], MAP_REGIONS[isoCode])
          expect(isLabelableBox(box), `${isoCode} can't carry a label`).toBe(true)
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

  it('anchors every label on the country it names', async () => {
    // The renderer hangs each name at `poleOfInaccessibility` — the centre of
    // the largest circle that fits inside the country — precisely because a
    // rectangle's centre lands on the NEIGHBOUR for anything that curves
    // around another. So the assertion has to be point-in-polygon against the
    // real outline, not containment in some box: Norway's box centre is in
    // Sweden and every box test in the world calls that fine.
    for (const difficulty of gameDifficulties) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const { errata } = await dealErrata(difficulty)
        for (const isoCode of errata.lineup) {
          const ring = largestRing(MAP_PATHS[isoCode])
          if (!ring) throw new Error(`${isoCode} has no outline`)
          const anchor = poleOfInaccessibility(ring)
          // `undefined` is the honest failure — it means no interior point was
          // found, and the stage would fall back to a box centre off the land.
          expect(anchor, `${isoCode} has no interior anchor`).toBeTruthy()
          expect(ringContains(ring, anchor!.point), `${isoCode}'s name lands off it`).toBe(true)
        }
      }
    }
  })

  // The give-up token a timed gate submits when its clock expires must be
  // WRONG. Errata's swap accepts EITHER culprit and its culprits border each
  // other, so a token that only dodged `challenge.country` handed a {CH, AT}
  // swap the win — for letting the clock run out, at the undiminished pot.
  it('never gives up into a right answer, even on the CH/AT swap', () => {
    for (const [country, other] of [
      ['CH', 'AT'],
      ['AT', 'CH'],
    ] as const) {
      const dealt = {
        id: 'errata',
        country,
        variant: 'errata',
        errata: {
          lineup: [country, other, 'DE', 'FR', 'IT'],
          kind: 'swap',
          culprits: [country, other],
          labels: { [country]: countryName(other), [other]: countryName(country) },
        },
      } as const satisfies Pick<IndividualChallenge, 'id' | 'country' | 'variant' | 'errata'>

      expect(isCorrectIndividualAnswer(dealt, wrongTokenFor(dealt))).toBe(false)
    }
  })

  it('never gives up into a right answer on a dealt gate', async () => {
    for (const difficulty of gameDifficulties) {
      for (let attempt = 0; attempt < 15; attempt++) {
        const { dealt } = await dealErrata(difficulty)
        expect(isCorrectIndividualAnswer(dealt, wrongTokenFor(dealt))).toBe(false)
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
