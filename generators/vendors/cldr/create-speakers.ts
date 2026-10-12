import { countries } from 'countries-list'
import { writeFileSync } from 'fs'
import { FACTBOOK } from '../../../data/factbook.gen'
import { SPOKEN_LANGUAGE_SHARES } from '../../../data/static/spoken-language-shares'
import { ISOCountryCodes } from '../../../data/iso-codes.gen'
import type { FactbookResponse } from '../../../types/response.type'
import type { SpeakerRow, SpeakerTable } from '../../../types/speakers.types'
import { jsonParseLiteral } from '../../lib/emit'
import {
  canonicalLanguage,
  cldrLanguage,
  firstLanguageShares,
  namedLanguages,
  officialLanguages,
  regionalOfficialLanguages,
} from '../../lib/languages'

const OUTPUT_FILE = 'data/speakers.gen.ts'
const REPORT_FILE = 'generators/data/speakers-report.txt'

/** Pinned so a regen is reproducible; bump with `SOURCES['unicode-cldr'].edition`. */
const CLDR_VERSION = '48.0.0'
const CLDR_BASE = `https://raw.githubusercontent.com/unicode-org/cldr-json/${CLDR_VERSION}/cldr-json`

/**
 * Below this a usage figure is too small to excuse a guess: a row is kept only
 * when a source names the language, a statute makes it official, or CLDR puts
 * this share of the country behind it.
 */
const RECORDED_SHARE = 1

interface CldrLanguagePopulation {
  _populationPercent?: string
  _officialStatus?: 'official' | 'de_facto_official' | 'official_regional' | 'official_minority'
}

interface CldrTerritoryInfo {
  supplemental: {
    territoryInfo: {
      [territory: string]: { languagePopulation?: { [code: string]: CldrLanguagePopulation } }
    }
  }
}

interface CldrLanguageNames {
  main: { en: { localeDisplayNames: { languages: { [code: string]: string } } } }
}

const fetchJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${CLDR_BASE}/${path}`, {
    headers: { 'User-Agent': 'mondiale-generator' },
  })
  if (!response.ok) throw new Error(`CLDR ${path}: HTTP ${response.status}`)
  return (await response.json()) as T
}

const factbookLanguageText = (data: FactbookResponse | undefined): string | undefined => {
  const languagesNode = data?.['People and Society']?.Languages
  return languagesNode?.Languages?.text ?? languagesNode?.text
}

const listedLanguages = (isoCode: string): string[] => {
  const country = countries[isoCode as keyof typeof countries]
  if (!country) return []
  return country.languages.flatMap(code => {
    const name = cldrLanguage(code, {})
    return name ? [name] : []
  })
}

/** CLDR's usage share and statute per language, varieties folded to the larger figure. */
const cldrRows = (
  territory: CldrTerritoryInfo['supplemental']['territoryInfo'][string] | undefined,
  displayNames: { [code: string]: string }
): Map<string, { share: number; status?: CldrLanguagePopulation['_officialStatus'] }> => {
  const rows = new Map<
    string,
    { share: number; status?: CldrLanguagePopulation['_officialStatus'] }
  >()
  for (const [code, population] of Object.entries(territory?.languagePopulation ?? {})) {
    const language = cldrLanguage(code, displayNames)
    if (!language) continue
    const share = Number.parseFloat(population._populationPercent ?? '0')
    const previous = rows.get(language)
    rows.set(language, {
      share: Math.max(share, previous?.share ?? 0),
      status: previous?.status ?? population._officialStatus,
    })
  }
  return rows
}

const main = async () => {
  const [territoryInfo, languageNames] = await Promise.all([
    fetchJson<CldrTerritoryInfo>('cldr-core/supplemental/territoryInfo.json'),
    fetchJson<CldrLanguageNames>('cldr-localenames-full/main/en/languages.json'),
  ])
  const displayNames = languageNames.main.en.localeDisplayNames.languages

  const table: SpeakerTable = {}
  const unsized: string[] = []
  const redundant: string[] = []
  const statuteDisagreements: string[] = []

  for (const isoCode of ISOCountryCodes) {
    const text = factbookLanguageText(FACTBOOK[isoCode])
    const marked = officialLanguages(text)
    const regional = new Set(regionalOfficialLanguages(text))
    // The source not marking an official is not a country without one: fall
    // back to `countries-list`, as `Country.officialLanguages` does.
    const national = (marked.length ? marked : listedLanguages(isoCode)).filter(
      language => !regional.has(language)
    )
    const factbookShares = new Map(
      firstLanguageShares(text).map(({ language, share }) => [language, share])
    )
    const cldr = cldrRows(territoryInfo.supplemental.territoryInfo[isoCode], displayNames)
    const curated = new Map(
      (SPOKEN_LANGUAGE_SHARES[isoCode] ?? []).map(row => [canonicalLanguage(row.language), row])
    )

    const named = new Set([
      ...national,
      ...regional,
      ...namedLanguages(text),
      ...listedLanguages(isoCode),
      ...curated.keys(),
      ...[...cldr].filter(([, { status }]) => status).map(([language]) => language),
    ])

    const rows: { [language: string]: SpeakerRow } = {}
    for (const language of new Set([...named, ...cldr.keys()])) {
      const fromFactbook = factbookShares.get(language)
      const fromCldr = cldr.get(language)?.share
      const fromCurated = curated.get(language)?.share

      const status = cldr.get(language)?.status
      // CLDR counts everyone who uses a language, schooling included —
      // Lithuania's Russian is 80% there and 6.8% as a mother tongue. Its figure
      // sizes a language only when a statute vouches for it as the country's own,
      // and then the larger figure wins: South Africa's English is 8.1% at home
      // and 31% in use, and it is the country's language either way.
      const vouched =
        national.includes(language) ||
        regional.has(language) ||
        status === 'official' ||
        status === 'de_facto_official'

      const row: SpeakerRow = {}
      if (fromCurated !== undefined) {
        row.share = fromCurated
        row.source = 'mondiale-editorial'
        if (vouched && fromCldr !== undefined && fromCldr >= fromCurated) {
          redundant.push(`${isoCode} ${language}: curated ${fromCurated}%, CLDR ${fromCldr}%`)
        }
      } else if (fromFactbook !== undefined && (!vouched || fromFactbook >= (fromCldr ?? 0))) {
        row.share = fromFactbook
        row.source = 'cia-factbook'
      } else if (fromCldr !== undefined && (vouched || !named.has(language))) {
        row.share = fromCldr
        row.source = 'unicode-cldr'
      }
      if (national.includes(language)) row.official = 'national'
      else if (regional.has(language)) row.official = 'regional'
      if (named.has(language)) row.named = true

      if (!row.named && (row.share ?? 0) < RECORDED_SHARE) continue
      if (row.named && row.share === undefined) unsized.push(`${isoCode} ${language}`)
      if (
        (status === 'official' || status === 'de_facto_official') &&
        row.official !== 'national'
      ) {
        statuteDisagreements.push(
          `${isoCode} ${language}: CLDR ${status}, Factbook ${row.official ?? 'unmarked'}`
        )
      }
      rows[language] = row
    }
    table[isoCode] = rows
  }

  writeFileSync(
    OUTPUT_FILE,
    [
      '// Generated by generators/vendors/cldr/create-speakers.ts — do not edit by hand.',
      "import type { SpeakerTable } from '../types/speakers.types'",
      '',
      `export const SPEAKERS: SpeakerTable = ${jsonParseLiteral(table)}`,
      '',
    ].join('\n')
  )

  writeFileSync(
    REPORT_FILE,
    [
      `Speaker table from CLDR ${CLDR_VERSION} territoryInfo, the Factbook snapshot and data/static/spoken-language-shares.ts.`,
      '',
      `Named by a source but sized by none (${unsized.length}) — a national statute still counts; anything else needs a curated row:`,
      ...unsized.map(line => `  ${line}`),
      '',
      `Curated rows CLDR now sizes at least as high (${redundant.length}) — candidates to delete:`,
      ...redundant.map(line => `  ${line}`),
      '',
      `CLDR calls official what the Factbook does not mark nationally (${statuteDisagreements.length}) — named, never a statute:`,
      ...statuteDisagreements.map(line => `  ${line}`),
      '',
    ].join('\n')
  )
  console.log(`Wrote ${OUTPUT_FILE} (${Object.keys(table).length} countries) and ${REPORT_FILE}`)
}

await main()
