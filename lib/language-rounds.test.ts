import { afterEach, describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { getRoundChallenge } from '~~/lib/challenges'
import {
  boardSpeakers,
  speaksLanguage,
  tongueBuzzRule,
  tongueBuzzTally,
  motherTongueQuestion,
  motherTongueScope,
  motherTongueStakes,
  speaksButOffBoard,
} from '~~/lib/language-rounds'
import { playableCountries } from '~~/lib/game-rules'
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
 *  the same pool and the same index `getMotherTongueChallenge` deals from. */
const variantSpeakers = (variant: GameVariant): Map<string, ISOCountryCode[]> =>
  boardSpeakers(playableCountries(rules(variant)))

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
    expect(motherTongueStakes(challenge)).toContain('3 countries speak German')
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

  it('credits a country on either list', () => {
    // The two fields legitimately diverge in BOTH directions: Slovenia makes
    // Italian official on the coast without the spoken list carrying it, and
    // Kazakhstan speaks Russian without a statute saying so. A player who knows
    // either must not be charged for it.
    expect(COUNTRIES.SI?.officialLanguages).toContain('Italian')
    expect(COUNTRIES.SI?.languages ?? []).not.toContain('Italian')
    expect(speaksButOffBoard(challengeOf('Italian', ['IT', 'SM', 'VA'], 'europe'), 'SI')).toBe(true)

    expect(COUNTRIES.KZ?.officialLanguages ?? []).not.toContain('Russian')
    expect(COUNTRIES.KZ?.languages).toContain('Russian')
    expect(speaksButOffBoard(challengeOf('Russian', ['RU', 'BY', 'UA'], 'europe'), 'KZ')).toBe(true)
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
      for (const [language, countries] of variantSpeakers(variant)) {
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
      const onBoard = variantSpeakers(variant)
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
      // Every answer speaks the language on one list or the other — the round
      // asks "who speaks it", and both fields are half the answer.
      for (const isoCode of challenge.countries) {
        expect(speaksLanguage(isoCode, challenge.language), `${variant}/${isoCode}`).toBe(true)
      }
      // …and nobody who speaks it on this board is left out of the set, or the
      // round would charge a point for the right answer.
      const onBoard = variantSpeakers(variant).get(challenge.language) ?? []
      expect([...challenge.countries].sort(), variant).toEqual([...onBoard].sort())
    }
  })

  it('deals the speakers a statute never named', () => {
    // The bug in the screenshot: "Who speaks Russian?" dealt four countries and
    // called Kazakhstan a miss, because the Factbook files Russian there as
    // spoken rather than official. Both are answers now.
    const russian = boardSpeakers(ISOCountryCodes).get('Russian') ?? []
    expect(russian).toContain('RU')
    expect(russian).toContain('KZ')
    expect(russian).toContain('UZ')
    // And the reverse case the spoken list alone would drop: Burundi's English
    // is official there and reaches no spoken list.
    expect(boardSpeakers(ISOCountryCodes).get('English') ?? []).toContain('BI')
  })
})

describe('tongue buzz', () => {
  afterEach(() => {
    delete process.env.FORCE_ROUND_TYPE
  })

  it('deals every country on the board that speaks the language', async () => {
    // The round's prompt says "where that language is spoken", and it grades
    // the same index Mother Tongue deals — the two used to read one field each
    // and disagree about Burundi's English and Kazakhstan's Russian.
    process.env.FORCE_ROUND_TYPE = 'tongue-buzz'
    for (const variant of [...REGIONAL, 'world' as const]) {
      const challenge = await getRoundChallenge({ game: rules(variant) })
      if (!isChallengeOfType(challenge, 'tongue-buzz-challenge')) continue
      expect(challenge.scope, variant).toBe(variant === 'world' ? undefined : variant)
      for (const isoCode of challenge.countries) {
        expect(speaksLanguage(isoCode, challenge.language), `${variant}/${isoCode}`).toBe(true)
      }
      const onBoard = variantSpeakers(variant).get(challenge.language) ?? []
      expect([...challenge.countries].sort(), variant).toEqual([...onBoard].sort())
      // The veto can never swallow one of its own answers.
      for (const isoCode of challenge.countries) {
        expect(speaksButOffBoard(challenge, isoCode), `${variant}/${isoCode}`).toBe(false)
      }
    }
  })

  it('credits an off-board speaker instead of locking them out', () => {
    // A Europe board dealing French: buzzing Senegal is right about the world.
    const challenge = {
      language: 'French',
      countries: ['FR', 'BE', 'LU', 'MC', 'CH'] as ISOCountryCode[],
      scope: 'europe' as const,
    }
    expect(speaksButOffBoard(challenge, 'SN')).toBe(true)
    expect(speaksButOffBoard(challenge, 'FR')).toBe(false)
    expect(tongueBuzzRule(challenge)).toContain('in Europe')
    expect(tongueBuzzTally(challenge)).toBe('Spoken in 5 countries in Europe')
  })

  it('leaves a world board unscoped', () => {
    const challenge = {
      language: 'German',
      scope: undefined,
      countries: ['DE', 'AT', 'CH'] as ISOCountryCode[],
    }
    expect(tongueBuzzRule(challenge)).toBe("Any country where it's spoken counts")
    expect(tongueBuzzTally(challenge)).toBe('Spoken in 3 countries')
  })
})
