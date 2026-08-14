import { describe, expect, it } from 'vitest'
import { FACTBOOK } from '~~/data/factbook.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { canonicalLanguage, officialLanguages, splitLanguageSegments } from './languages'
import type { ISOCountryCode } from '~~/types/geography.types'

/** The Factbook's languages prose, in either shape it ships. */
const factbookLanguages = (isoCode: string): string | undefined => {
  const node = (FACTBOOK[isoCode] as Record<string, unknown> | undefined)?.[
    'People and Society'
  ] as { Languages?: { Languages?: { text?: string }; text?: string } } | undefined
  return node?.Languages?.Languages?.text ?? node?.Languages?.text
}

const officialFor = (isoCode: string) => officialLanguages(factbookLanguages(isoCode))

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
    expect(officialFor('ES')).toContain('Aranese')
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
