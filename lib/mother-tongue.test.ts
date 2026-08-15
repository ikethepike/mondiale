import { afterEach, describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { getRoundChallenge } from '~~/lib/challenges'
import {
  motherTongueQuestion,
  motherTongueScope,
  motherTongueStakes,
  speaksButOffBoard,
} from '~~/lib/mother-tongue'
import { countryInVariant } from '~~/lib/variant'
import { isChallengeOfType } from '~~/lib/rounds'
import type { MotherTongueChallenge } from '~~/types/challenges/group-modes.type'
import type { Game, GameDifficulty, GameVariant } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'

const rules = (variant: GameVariant, difficulty: GameDifficulty = 'normal') =>
  ({ difficulty, variant, rounds: [] }) as unknown as Game

const REGIONAL: Exclude<GameVariant, 'world'>[] = [
  'europe',
  'africa',
  'asia',
  'north-america',
  'south-america',
]

/** Every language a variant could deal, with the speakers standing on it —
 *  the OFFICIAL list, the same field `getMotherTongueChallenge` deals from. */
const boardSpeakers = (variant: GameVariant): Map<string, ISOCountryCode[]> => {
  const speakers = new Map<string, ISOCountryCode[]>()
  for (const isoCode of ISOCountryCodes) {
    if (!countryInVariant(isoCode, variant)) continue
    for (const language of COUNTRIES[isoCode]?.officialLanguages ?? []) {
      speakers.set(language, [...(speakers.get(language) ?? []), isoCode])
    }
  }
  return speakers
}

const challengeOf = (
  language: string,
  countries: ISOCountryCode[],
  scope?: Exclude<GameVariant, 'world'>
): MotherTongueChallenge => ({
  _type: 'mother-tongue-challenge',
  language,
  countries,
  ...(scope ? { scope } : {}),
  durationSeconds: 30,
  maximumPoints: 3,
})

describe('mother tongue scope', () => {
  it('names the board a regional round was dealt on', () => {
    const challenge = challengeOf('French', ['FR', 'BE', 'LU', 'MC', 'CH'], 'europe')
    expect(motherTongueScope(challenge)).toBe('in Europe')
    expect(motherTongueQuestion(challenge)).toBe('Who speaks French in Europe?')
    expect(motherTongueStakes(challenge)).toContain('5 countries in Europe')
  })

  it('leaves a world board unscoped — the question was never narrowed', () => {
    const challenge = challengeOf('German', ['DE', 'AT', 'CH'])
    expect(motherTongueScope(challenge)).toBe('in the world')
    // The copy stays exactly as it read before this change.
    expect(motherTongueQuestion(challenge)).toBe('Who speaks German?')
    expect(motherTongueStakes(challenge)).toContain('3 countries have German')
  })

  it('keeps the article REGION_LABELS carries', () => {
    // 'the Middle East' is not a variant, but every variant that IS one must
    // read naturally after a bare "in".
    for (const variant of REGIONAL) {
      const phrase = motherTongueScope(challengeOf('English', [], variant))
      expect(phrase.startsWith('in ')).toBe(true)
      expect(phrase).not.toContain('in the the')
    }
  })
})

describe('off-board veto', () => {
  it('credits a speaker standing off the board', () => {
    // The screenshot: a Europe board asking for French.
    const challenge = challengeOf('French', ['FR', 'BE', 'LU', 'MC', 'CH'], 'europe')
    // Burundi and Senegal speak French — right about the world, off this board.
    expect(speaksButOffBoard(challenge, 'BI')).toBe(true)
    expect(speaksButOffBoard(challenge, 'SN')).toBe(true)
    // Grenada speaks English only: a real miss, and it must still cost.
    expect(speaksButOffBoard(challenge, 'GD')).toBe(false)
    // An answer already in the set is never vetoed.
    expect(speaksButOffBoard(challenge, 'FR')).toBe(false)
  })

  it('credits a country official on either list', () => {
    // The two fields legitimately diverge: Slovenia makes Italian official on
    // the coast, and the ISO-639-1 spoken list never carried it. A player who
    // knows that must not be charged for it.
    expect(COUNTRIES.SI?.officialLanguages).toContain('Italian')
    const challenge = challengeOf('Italian', ['IT', 'SM', 'VA'], 'europe')
    expect(speaksButOffBoard(challenge, 'SI')).toBe(true)
  })

  it('never fires on a world board', () => {
    const challenge = challengeOf('German', ['DE', 'AT', 'CH', 'BE', 'LU', 'LI'])
    for (const isoCode of ISOCountryCodes) {
      expect(speaksButOffBoard(challenge, isoCode)).toBe(false)
    }
  })

  it('can never eat a country from the answer set', () => {
    // The load-bearing invariant: whatever the board and whatever the language,
    // a real answer must always score. A veto that swallowed one would silently
    // make the round unwinnable.
    for (const variant of REGIONAL) {
      for (const [language, countries] of boardSpeakers(variant)) {
        const challenge = challengeOf(language, countries, variant)
        for (const isoCode of countries) {
          expect(speaksButOffBoard(challenge, isoCode), `${variant}/${language}/${isoCode}`).toBe(
            false
          )
        }
      }
    }
  })

  it('vetoes the off-board speakers the old round punished', () => {
    // Every regional board has at least one language whose off-board speakers
    // outnumber its answer set — that is what made this a real bug.
    for (const variant of REGIONAL) {
      const onBoard = boardSpeakers(variant)
      let vetoed = 0
      for (const [language, countries] of onBoard) {
        if (countries.length < 3 || countries.length > 12) continue
        const challenge = challengeOf(language, countries, variant)
        vetoed += ISOCountryCodes.filter(isoCode => speaksButOffBoard(challenge, isoCode)).length
      }
      expect(vetoed, variant).toBeGreaterThan(0)
    }
  })
})

describe('the dealt round', () => {
  afterEach(() => {
    delete process.env.FORCE_ROUND_TYPE
  })

  it('stamps the board on a regional deal and nothing on a world deal', async () => {
    process.env.FORCE_ROUND_TYPE = 'mother-tongue'
    for (const variant of [...REGIONAL, 'world' as const]) {
      const challenge = await getRoundChallenge({ game: rules(variant) })
      if (!isChallengeOfType(challenge, 'mother-tongue-challenge')) continue
      expect(challenge.scope, variant).toBe(variant === 'world' ? undefined : variant)
      // Every answer holds the language OFFICIALLY — the field the round's own
      // copy claims. It is not the spoken list: Slovenia makes Italian official
      // in its coastal municipalities without `languages` ever listing it.
      for (const isoCode of challenge.countries) {
        expect(COUNTRIES[isoCode]?.officialLanguages ?? [], `${variant}/${isoCode}`).toContain(
          challenge.language
        )
      }
    }
  })
})
