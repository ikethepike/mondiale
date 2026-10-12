import { afterEach, describe, expect, it } from 'vitest'
import { SPEAKERS } from '~~/data/speakers.gen'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { getRoundChallenge, speaksTongue } from '~~/lib/challenges'
import { scriptoriumAccepts, scriptoriumAnswers } from '~~/lib/scriptorium'
import {
  boardSpeakers,
  isSignLanguage,
  MOTHER_TONGUE_SPEAKERS,
  acceptsSpeaker,
  languageBounce,
  isHeadlineLanguage,
  languageBounceLine,
  motherTongueDeck,
  officialLanguages,
  speakerRow,
  speaksLanguage,
  spokenLanguages,
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
import type { BoardRegion, Game, GameDifficulty, GameVariant } from '~~/types/game.types'
import { regionsForVariant } from '~~/lib/board-regions'
import type { ISOCountryCode } from '~~/types/geography.types'

const rules = (variant: GameVariant, difficulty: GameDifficulty = 'normal') =>
  ({ difficulty, regions: regionsForVariant(variant), rounds: [] }) as unknown as Game

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
  scope?: BoardRegion[]
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
    const challenge = challengeOf('French', ['FR', 'BE', 'LU', 'MC', 'CH'], ['europe'])
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

  it('names every region of a combined board', () => {
    const challenge = challengeOf('French', ['FR', 'BE', 'SN', 'CI'], ['europe', 'africa'])
    expect(motherTongueQuestion(challenge)).toBe('Who speaks French in Europe and Africa?')
    expect(motherTongueStakes(challenge)).toContain('4 countries in Europe and Africa')
  })

  it('keeps the article REGION_LABELS carries', () => {
    // 'the Middle East' is not a variant, but every variant that IS one must
    // read naturally after a bare "in".
    for (const variant of REGIONAL) {
      const phrase = motherTongueScope(challengeOf('English', [], [variant]))
      expect(phrase.startsWith('in ')).toBe(true)
      expect(phrase).not.toContain('in the the')
    }
  })
})

describe('off-board veto', () => {
  it('credits a speaker standing off the board', () => {
    // The screenshot: a Europe board asking for French.
    const challenge = challengeOf('French', ['FR', 'BE', 'LU', 'MC', 'CH'], ['europe'])
    // Burundi and Senegal speak French — right about the world, off this board.
    expect(speaksButOffBoard(challenge, 'BI')).toBe(true)
    expect(speaksButOffBoard(challenge, 'SN')).toBe(true)
    // Grenada speaks English only: a real miss, and it must still cost.
    expect(speaksButOffBoard(challenge, 'GD')).toBe(false)
    // An answer already in the set is never vetoed.
    expect(speaksButOffBoard(challenge, 'FR')).toBe(false)
  })

  it('credits a speaker no statute names', () => {
    // Kazakhstan speaks Russian whether or not a statute says so; a player who
    // knows it must not be charged for it.
    expect(speaksLanguage('KZ', 'Russian')).toBe(true)
    expect(speaksButOffBoard(challengeOf('Russian', ['RU', 'BY', 'UA'], ['europe']), 'KZ')).toBe(
      true
    )
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
        const challenge = challengeOf(language, countries, [variant])
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
        if (
          countries.length < MOTHER_TONGUE_SPEAKERS.min ||
          countries.length > MOTHER_TONGUE_SPEAKERS.max
        ) {
          continue
        }
        const challenge = challengeOf(language, countries, [variant])
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
      expect(challenge.scope, variant).toEqual(variant === 'world' ? undefined : [variant])
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

  it('stamps every region of a combined board and deals every speaker on it', async () => {
    process.env.FORCE_ROUND_TYPE = 'mother-tongue'
    const game = {
      difficulty: 'normal',
      regions: ['europe', 'africa'],
      rounds: [],
    } as unknown as Game
    const challenge = await getRoundChallenge({ game })
    if (!isChallengeOfType(challenge, 'mother-tongue-challenge')) {
      throw new Error(`fell back to ${challenge._type}`)
    }
    expect(challenge.scope).toEqual(['europe', 'africa'])
    const onBoard = boardSpeakers(playableCountries(game)).get(challenge.language) ?? []
    expect([...challenge.countries].sort()).toEqual([...onBoard].sort())
  })

  it('deals the speakers a statute never named', () => {
    // The bug in the screenshot: "Who speaks Russian?" dealt four countries and
    // called Kazakhstan a miss, because the Factbook files Russian there as
    // spoken rather than official.
    const russian = boardSpeakers(ISOCountryCodes).get('Russian') ?? []
    expect(russian).toEqual(expect.arrayContaining(['RU', 'KZ', 'UZ', 'UA', 'LV', 'EE']))
    // Malaysia's Chinese fifth is larger than Singapore's whole population.
    expect(boardSpeakers(ISOCountryCodes).get('Chinese')).toContain('MY')
  })

  it('does not require a statute almost nobody speaks', () => {
    // Burundi makes English official and CLDR puts 0.05% behind it.
    expect(speaksLanguage('BI', 'English')).toBe(false)
    expect(speakerRow('BI', 'English')?.official).toBe('national')
    expect(languageBounce(challengeOf('English', ['GB', 'IE']), 'BI')).toBe('statute')
  })

  it('reads a first-language census over a usage estimate', () => {
    // CLDR has 80% of Lithuania using Russian; 6.8% speak it at home.
    expect(speakerRow('LT', 'Russian')).toMatchObject({ share: 6.8, source: 'cia-factbook' })
    expect(speaksLanguage('LT', 'Russian')).toBe(false)
    expect(languageBounce(challengeOf('Russian', ['RU', 'BY']), 'LT')).toBe('minority')
  })

  it('takes the larger figure where a statute vouches for the language', () => {
    // South Africa's English: 8.1% at home, 31% in use — and official.
    expect(speaksLanguage('ZA', 'English')).toBe(true)
    // Switzerland's Factbook figures are a survey; CLDR sizes its Italian.
    expect(speaksLanguage('CH', 'Italian')).toBe(true)
  })

  it('accepts a second language without requiring it', () => {
    // Most Swedes speak English; no source names it as Sweden's own.
    expect(speakerRow('SE', 'English')?.named).toBeUndefined()
    expect(speaksLanguage('SE', 'English')).toBe(false)
    expect(languageBounce(challengeOf('English', ['GB', 'IE']), 'SE')).toBe('unlisted')
    expect(languageBounceLine(challengeOf('English', ['GB', 'IE']), 'SE')).toBe(
      'Sweden has English speakers, but no source lists it as a language of its own — not counted'
    )
  })

  it('deals every language the board speaks in two to 32 countries', () => {
    const world = motherTongueDeck(playableCountries(rules('world')), new Set())
    const languages = world.map(([language]) => language)
    expect(languages).toEqual(
      expect.arrayContaining(['Spanish', 'French', 'Arabic', 'Russian', 'Portuguese'])
    )
    expect(languages).not.toContain('English')
    expect(world.length).toBeGreaterThan(25)
    for (const variant of ['north-america', 'south-america'] as const) {
      expect(
        motherTongueDeck(playableCountries(rules(variant)), new Set()).map(
          ([language]) => language
        ),
        variant
      ).toContain('Spanish')
    }
  })

  it('asks a fresh language until the board runs out', () => {
    const pool = playableCountries(rules('south-america'))
    const all = motherTongueDeck(pool, new Set())
    const [first] = all[0]!
    expect(motherTongueDeck(pool, new Set([first])).map(([language]) => language)).not.toContain(
      first
    )
    expect(motherTongueDeck(pool, new Set(all.map(([language]) => language)))).toEqual(all)
  })
})

describe('spoken languages', () => {
  it('does not count an officiality confined to one region', () => {
    // Croatian is official in Burgenland and spoken by 1.6% of Austria.
    expect(speakerRow('AT', 'Croatian')?.official).toBe('regional')
    expect(speaksLanguage('AT', 'Croatian')).toBe(false)
    expect(speaksLanguage('SI', 'Italian')).toBe(false)
    // A regional official the country also speaks at scale still counts.
    expect(speakerRow('ES', 'Catalan')?.official).toBe('regional')
    expect(speaksLanguage('ES', 'Catalan')).toBe(true)
  })

  it('accepts a regional speaker without requiring it', () => {
    // Naming Austria for Croatian bounces free on any board: right about a
    // statute, never one of the answers.
    const croatian = challengeOf('Croatian', ['BA', 'HR'])
    expect(languageBounce(croatian, 'AT')).toBe('statute')
    expect(languageBounceLine(croatian, 'AT')).toBe(
      'Austria makes Croatian official only regionally — not counted'
    )
    expect(languageBounce(challengeOf('Italian', ['IT', 'CH']), 'SI')).toBe('statute')
    expect(languageBounce(croatian, 'HR')).toBeUndefined()
    expect(languageBounce(croatian, 'FR')).toBeUndefined()
    // Spain speaks Catalan at scale, so it is an answer, never a bounce.
    expect(speaksLanguage('ES', 'Catalan')).toBe(true)
    expect(languageBounce(challengeOf('French', ['FR', 'BE'], ['europe']), 'SN')).toBe('off-board')
  })

  it('never names the language in a Tongue Buzz bounce', () => {
    const line = languageBounceLine(challengeOf('English', ['GB', 'IE']), 'BI', 'it')
    expect(line).toBe('Burundi makes it official, but under 1% speak it — not counted')
  })

  it('reads officiality from the statutes alone, in source order', () => {
    expect(officialLanguages('BI')).toEqual(['Kirundi', 'French', 'English'])
    // "(state language)" is Kyrgyzstan's word for it.
    expect(officialLanguages('KG')).toEqual(['Kyrgyz', 'Russian'])
    // A regional statute is not a national one.
    expect(officialLanguages('AT')).not.toContain('Croatian')
    expect(officialLanguages('PT')).toEqual(['Portuguese'])
  })

  it('names a language on its own only when a player could have met it', () => {
    const headline = (language: string) =>
      isHeadlineLanguage(language, [...(boardSpeakers(ISOCountryCodes).get(language) ?? [])])
    expect(headline('Greek')).toBe(true)
    expect(headline('Japanese')).toBe(true)
    expect(headline('Oromo')).toBe(false)
    expect(headline('Fiji Hindi')).toBe(false)
  })

  it('bounces a speaker benched from a world board as off the board', () => {
    // Liechtenstein speaks German; a world deal that benched it must not
    // tell the player "only 100% speak it".
    const german = challengeOf('German', ['DE', 'AT', 'CH'])
    expect(languageBounce(german, 'LI')).toBe('off-board')
    expect(languageBounceLine(german, 'LI')).toBe(
      "Liechtenstein does speak German — but it isn't in play this game"
    )
  })

  it('never claims a share no source measured', () => {
    const swahili = challengeOf('Swahili', ['KE', 'TZ', 'UG'])
    expect(speakerRow('CD', 'Swahili')?.share).toBeUndefined()
    expect(languageBounceLine(swahili, 'CD')).toBe(
      'Democratic Republic of the Congo has Swahili speakers, but no source counts how many speak it — not counted'
    )
  })

  it('accepts a statute or a named minority, never a school subject', () => {
    expect(acceptsSpeaker('BI', 'English')).toBe(true)
    expect(acceptsSpeaker('LT', 'Russian')).toBe(true)
    expect(acceptsSpeaker('DE', 'English')).toBe(false)
    expect(acceptsSpeaker('SE', 'English')).toBe(false)
  })

  it('keeps a buzz round from being probed for free', () => {
    const english = {
      ...challengeOf('English', ['GB', 'IE']),
      _type: 'tongue-buzz-challenge' as const,
      clips: [],
    }
    // Only an off-board speaker bounces. A statute or a named minority is paid,
    // a bare usage figure is a miss — neither line can be read for free.
    for (const isoCode of ['BI', 'SE', 'NL'] as const) {
      expect(languageBounce(english, isoCode), isoCode).toBeUndefined()
    }
    expect(speaksTongue(english, 'BI')).toBe(true)
    expect(speaksTongue(english, 'SE')).toBe(false)
    const european = {
      ...english,
      countries: ['GB', 'IE', 'MT'] as ISOCountryCode[],
      scope: ['europe' as const],
    }
    expect(languageBounce(european, 'US')).toBe('off-board')
    expect(speaksTongue(european, 'BI')).toBe(false)
  })

  it('grades a Scriptorium page as the final grades its language', () => {
    // Singapore makes Tamil official at a 2.5% share: accepted, not listed.
    expect(scriptoriumAnswers('Tamil')).not.toContain('SG')
    expect(scriptoriumAccepts('Tamil', 'SG')).toBe(true)
    expect(scriptoriumAccepts('Tamil', 'FR')).toBe(false)
  })

  it('keeps the curated rows that name a language no other source sizes', () => {
    // Andorra's Spanish is named only by the curated row; without it CLDR's
    // 43% filed it as a second language.
    expect(speakerRow('AD', 'Spanish')).toMatchObject({ named: true, source: 'mondiale-editorial' })
    expect(speaksLanguage('AD', 'Spanish')).toBe(true)
  })

  it('folds the varieties CLDR files apart', () => {
    expect(SPEAKERS.PK?.['Western Panjabi']).toBeUndefined()
    expect(speaksLanguage('PK', 'Punjabi')).toBe(true)
    expect(speaksLanguage('FJ', 'Hindi')).toBe(true)
  })

  it('never counts a sign language as spoken', () => {
    expect(SPEAKERS.NZ?.['New Zealand Sign Language']).toBeDefined()
    expect(isSignLanguage('New Zealand Sign Language')).toBe(true)
    expect(isSignLanguage('English')).toBe(false)
    for (const isoCode of ISOCountryCodes) {
      for (const language of spokenLanguages(isoCode)) {
        expect(isSignLanguage(language), `${isoCode}/${language}`).toBe(false)
      }
    }
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
      expect(challenge.scope, variant).toEqual(variant === 'world' ? undefined : [variant])
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
      _type: 'tongue-buzz-challenge' as const,
      language: 'French',
      countries: ['FR', 'BE', 'LU', 'MC', 'CH'] as ISOCountryCode[],
      scope: ['europe' as const],
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
