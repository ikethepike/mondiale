import { describe, expect, it } from 'vitest'
import { FACTBOOK } from '~~/data/factbook.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { spokenLanguages } from '~~/lib/language-rounds'
import { SPOKEN_LANGUAGE_SHARES } from '~~/data/static/spoken-language-shares'
import {
  ISO_LANGUAGE_NAMES,
  LANGUAGE_ALIASES,
  SPOKEN_POPULATION_FLOOR,
  canonicalLanguage,
  isWidelySpoken,
  officialLanguages,
  regionalOfficialLanguages,
  splitLanguageSegments,
  widelySpokenLanguages,
} from './languages'
import type { ISOCountryCode } from '~~/types/geography.types'

/** The Factbook's languages prose, in either shape it ships. */
const factbookLanguages = (isoCode: string): string | undefined => {
  const node = (FACTBOOK[isoCode] as Record<string, unknown> | undefined)?.[
    'People and Society'
  ] as { Languages?: { Languages?: { text?: string }; text?: string } } | undefined
  return node?.Languages?.Languages?.text ?? node?.Languages?.text
}

const officialFor = (isoCode: string) => officialLanguages(factbookLanguages(isoCode))
const regionalFor = (isoCode: string) => regionalOfficialLanguages(factbookLanguages(isoCode))
const spokenFor = (isoCode: string) =>
  widelySpokenLanguages(
    factbookLanguages(isoCode),
    COUNTRIES[isoCode as ISOCountryCode]?.people.population?.amount
  )

describe('splitting the prose', () => {
  it('splits on top-level separators only', () => {
    expect(splitLanguageSegments('Kirundi (official), French (official)')).toEqual([
      'Kirundi (official)',
      'French (official)',
    ])
  })

  it('keeps a nested list whole', () => {
    // Equatorial Guinea's officials live INSIDE another segment's parenthetical.
    const segments = splitLanguageSegments(
      'Spanish (official) 67.6%, other (includes Fang, Bubi, Portuguese (official), French (official)) 32.4%'
    )
    expect(segments).toHaveLength(2)
    expect(segments[1]).toContain('Portuguese (official)')
  })
})

describe('official languages', () => {
  it('reads a plain list in the order the source gives', () => {
    // Burundi: the old source said ["French","Kirundi"] — English missing, and
    // French ranked above the near-universal Kirundi.
    expect(officialFor('BI')).toEqual(['Kirundi', 'French', 'English'])
  })

  it('finds a marker that is not the first thing in its parenthetical', () => {
    // Ecuador: "Spanish (Castilian; official) 98.6%"
    expect(officialFor('EC')).toEqual(['Spanish'])
  })

  it('reads through a second parenthetical', () => {
    // Switzerland: "German (or Swiss German) (official) 62.1%" — and Romansh,
    // which the ISO-639-1 source could not carry at all.
    expect(officialFor('CH')).toEqual(['German', 'French', 'Italian', 'Romansh'])
  })

  it('recovers officials buried in a nested bucket', () => {
    // Equatorial Guinea: Portuguese and French are inside "other (includes …)".
    // The old data had French but not Portuguese.
    const official = officialFor('GQ')
    expect(official).toContain('Spanish')
    expect(official).toContain('Portuguese')
  })

  it('splits a co-official compound segment', () => {
    // Paraguay: "Spanish (official) and Guarani (official) 46.3%"
    expect(officialFor('PY')).toEqual(['Spanish', 'Guarani'])
  })

  it('drops share qualifiers that are words, not digits', () => {
    // Belgium: "German (official) less than 1%"
    expect(officialFor('BE')).toEqual(['Dutch', 'French', 'German'])
    // The United States: "English only (official) 78.2%"
    expect(officialFor('US')).toEqual(['English'])
    // Thailand: "Thai (official) only 90.7%"
    expect(officialFor('TH')).toEqual(['Thai'])
  })

  it('takes the exonym from an endonym pair', () => {
    // South Africa lists "isiZulu or Zulu (official)" and ten more.
    const official = officialFor('ZA')
    expect(official).toContain('Zulu')
    expect(official).toContain('Xhosa')
    expect(official).not.toContain('isiZulu or Zulu')
  })

  it('unwraps a single-name group but drops a true bucket', () => {
    // Morocco's "Tamazight languages (Tamazight (official), …)" IS Tamazight.
    expect(officialFor('MA')).toContain('Tamazight')
    // South Africa's "Khoe or Khoisan languages" names no one language.
    expect(officialFor('ZA')).not.toContain('Khoe')
    // Zimbabwe's "13 minority languages (official; …)" is a count, not a name.
    expect(officialFor('ZW')).not.toContain('13 minority languages')
  })

  it('drops a truncated share with no percent sign', () => {
    // Spain's entry runs off mid-parenthetical: "Aranese (official"
    expect(officialFor('ES')).toContain('Occitan')
    expect(officialFor('ES').join(' ')).not.toMatch(/[<>]/)
  })

  it('is empty — never a guess — where the source marks nothing', () => {
    // 21 countries carry no "(official)" at all. They are not countries
    // without official languages; the source simply does not say, so callers
    // fall back to the spoken list.
    for (const isoCode of ['JP', 'GB', 'IN', 'MX', 'AU']) {
      expect(officialFor(isoCode), isoCode).toEqual([])
    }
  })
})

describe('canonical spelling', () => {
  it('maps towards the spelling the rest of the game uses', () => {
    // Four tables key off Country.languages by exact string, so the alias map
    // points AT the existing name even when the Factbook's is better.
    expect(canonicalLanguage('Kinyarwanda')).toBe('Rwandi')
    expect(canonicalLanguage('Khmer')).toBe('Cambodian')
    expect(canonicalLanguage('Bangla')).toBe('Bengali')
    expect(canonicalLanguage('Mandarin')).toBe('Chinese')
    expect(canonicalLanguage('French')).toBe('French')
  })

  it('spells a language one way across both sources', () => {
    // A language split across two spellings hides its speakers from each other:
    // "speaks siSwati" graded South Africa's Swati wrong.
    expect(canonicalLanguage('Somalia')).toBe('Somali')
    expect(canonicalLanguage('Somali')).toBe('Somali')
    expect(officialFor('ET')).toEqual(expect.arrayContaining(['Somali', 'Tigrinya']))
    expect(officialFor('SZ')).toContain('Swati')
    expect(officialFor('FJ')).toContain('Fijian')
    for (const isoCode of Object.keys(COUNTRIES) as ISOCountryCode[]) {
      for (const name of spokenLanguages(isoCode)) {
        expect(canonicalLanguage(name), `${isoCode}/${name}`).toBe(name)
      }
    }
  })

  it('never emits a name carrying source punctuation', () => {
    for (const isoCode of Object.keys(COUNTRIES) as ISOCountryCode[]) {
      for (const name of officialFor(isoCode)) {
        expect(name, `${isoCode}/${name}`).not.toMatch(/[()%<>]|\d|\s(?:or|and|only)\s/)
        expect(name.trim(), isoCode).toBe(name)
        expect(name.length, `${isoCode}/${name}`).toBeGreaterThan(1)
      }
    }
  })
})

describe('the corpus as a whole', () => {
  it('marks officials for the great majority of countries', () => {
    const withOfficial = (Object.keys(COUNTRIES) as ISOCountryCode[]).filter(
      isoCode => officialFor(isoCode).length > 0
    )
    // 173 of 194 today. A parser regression that silently emptied the field
    // would fail here rather than reaching the dealer.
    expect(withOfficial.length).toBeGreaterThan(165)
  })

  it('recovers the languages the ISO-639-1 source could not hold', () => {
    // The coverage this whole pass buys: languages with no two-letter code.
    expect(officialFor('CH')).toContain('Romansh')
    expect(officialFor('PG')).toContain('Tok Pisin')
    expect(officialFor('ML')).toContain('Bambara')
    expect(officialFor('ET')).toContain('Oromo')
  })
})

describe('regional officiality', () => {
  it('flags an official confined to a region', () => {
    expect(regionalFor('AT')).toEqual(['Croatian'])
    expect(regionalFor('NL')).toEqual(['Frisian'])
    expect(regionalFor('SI')).toEqual(['Hungarian', 'Italian'])
    expect(regionalFor('ES')).toEqual(['Catalan', 'Galician', 'Basque', 'Occitan'])
    expect(regionalFor('ET')).toEqual(['Oromo', 'Somali', 'Tigrinya', 'Afar'])
  })

  it('leaves a national official unflagged', () => {
    // "(official nationwide)", "(official national language)", "(official on most islands)".
    expect(regionalFor('AT')).not.toContain('German')
    expect(regionalFor('ET')).not.toContain('Amharic')
    expect(regionalFor('PW')).toEqual([])
    for (const isoCode of Object.keys(COUNTRIES)) {
      for (const language of regionalFor(isoCode)) {
        expect(officialFor(isoCode), `${isoCode}/${language}`).toContain(language)
      }
    }
  })
})

describe('widely spoken languages', () => {
  it('reads a speaker share no other source carries', () => {
    expect(spokenFor('UA')).toContain('Russian')
    expect(spokenFor('LV')).toContain('Russian')
    expect(spokenFor('EE')).toContain('Russian')
    // Moldova's 9.7%, read past "Moldovan/Romanian 80.2% (official) (56.7% Moldovan; …)".
    expect(spokenFor('MD')).toEqual(['Romanian', 'Russian'])
    expect(spokenFor('US')).toContain('Spanish')
  })

  it('counts a head count a share undersells', () => {
    // India's 2.7% Punjabi and 4.2% Urdu are each tens of millions of people.
    expect(spokenFor('IN')).toEqual(expect.arrayContaining(['Punjabi', 'Urdu']))
    expect(isWidelySpoken(1, SPOKEN_POPULATION_FLOOR * 100)).toBe(true)
    expect(isWidelySpoken(1, SPOKEN_POPULATION_FLOOR * 99)).toBe(false)
  })

  it('stops at the share threshold', () => {
    // Austria: "Croatian (official in Burgenland) 1.6%".
    expect(spokenFor('AT')).toEqual(['German'])
    expect(spokenFor('RS')).toEqual(['Serbian'])
  })

  it('ignores a can-speak survey', () => {
    // Hungary's shares add to 147%: "English 25.3%, German 12.6%" is schooling.
    expect(spokenFor('HU')).toEqual([])
    expect(spokenFor('CH')).toEqual([])
  })

  it('never reads one language as another that shares its name', () => {
    // Zambia's "Tonga 11.4%" is ChiTonga; Mauritius's "Creole 86.5%" is Morisien.
    expect(spokenFor('ZM')).not.toContain('Tonga')
    expect(spokenFor('MU')).not.toContain('Haitian')
  })

  it('adds only ISO 639-1 languages, in the game spelling', () => {
    for (const isoCode of Object.keys(COUNTRIES) as ISOCountryCode[]) {
      for (const name of spokenFor(isoCode)) {
        expect(ISO_LANGUAGE_NAMES.has(name), `${isoCode}/${name}`).toBe(true)
        expect(COUNTRIES[isoCode].languages, isoCode).toContain(name)
      }
    }
  })
})

describe('the curated speaker shares', () => {
  const ethnicGroups = (isoCode: string): string =>
    (
      (FACTBOOK[isoCode] as Record<string, unknown> | undefined)?.['People and Society'] as
        { 'Ethnic groups'?: { text?: string } } | undefined
    )?.['Ethnic groups']?.text ?? ''

  /** The prose names the language in either spelling ("Castilian" for Spanish). */
  const proseNames = (isoCode: string, language: string): boolean => {
    const text = factbookLanguages(isoCode) ?? ''
    return [
      language,
      ...Object.keys(LANGUAGE_ALIASES).filter(name => LANGUAGE_ALIASES[name] === language),
    ].some(name => new RegExp(`\\b${name}\\b`).test(text))
  }

  it('sizes only what the language prose names but the share parse cannot credit', () => {
    for (const [isoCode, rows] of Object.entries(SPOKEN_LANGUAGE_SHARES)) {
      const population = COUNTRIES[isoCode as ISOCountryCode].people.population?.amount
      for (const { language, share, basis, reason } of rows) {
        const where = `${isoCode}/${language}`
        expect(proseNames(isoCode, language), where).toBe(true)
        expect(spokenFor(isoCode), where).not.toContain(language)
        // A survey row's entry is one the parse skipped whole; an unsized one gives no figures.
        const figures = /\d\s*%/.test(factbookLanguages(isoCode) ?? '')
        expect(figures, where).toBe(reason === 'survey')
        if (reason === 'survey') expect(spokenFor(isoCode), where).toEqual([])
        expect(ethnicGroups(isoCode), where).toContain(basis)
        expect(Number.parseFloat(basis.replace(/^\D*?(\d)/, '$1')), where).toBe(share)
        expect(isWidelySpoken(share, population), where).toBe(true)
        expect(ISO_LANGUAGE_NAMES.has(language), where).toBe(true)
        expect(COUNTRIES[isoCode as ISOCountryCode].languages, where).toContain(language)
      }
    }
  })
})
