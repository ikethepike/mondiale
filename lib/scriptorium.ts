import { COUNTRIES } from '~~/data/countries.gen'
import type { ISOCountryCode } from '~~/types/geography.types'
import { isValidISOCode } from '~~/types/geography.types'
import { REGION_LABELS } from './variant'

/**
 * Scriptorium's pure logic: which languages the gate may deal, and which
 * countries count as a right answer. Both ends of the wire read this module —
 * the dealer, the submit handler's verdict and the reveal's chip list all
 * resolve the same pool and the same answer set, so they cannot drift.
 *
 * The written sample itself resolves through lib/tongue-samples (seeds or a
 * curated anthem lyric wall) — one home, shared with the Tongues round.
 */
export interface ScriptoriumEntry {
  /** Language name as it appears in `Country.languages` AND as a
   *  `TONGUES`/seed key, so the sample lookup and the answer set share it. */
  language: string
  /**
   * The script family, for the dealer's decoy rule and as the reveal's
   * fallback label. A lyric-derived sample carries its own (more precise)
   * script name — the reveal prefers that when it resolves.
   */
  script: string
  /** BCP-47 tag for the `lang` attribute — browsers pick fonts from it. */
  code: string
}

/**
 * Languages whose writing alone narrows the world: a resolvable written
 * sample, a script that is not the Latin alphabet, and at least one country
 * that lists the language as official. Pruned by lib/scriptorium.test.ts —
 * every entry must resolve a sample and a non-empty answer set.
 */
export const SCRIPTORIUM_POOL: ScriptoriumEntry[] = [
  { language: 'Arabic', script: 'Arabic script', code: 'ar' },
  { language: 'Russian', script: 'Cyrillic script', code: 'ru' },
  { language: 'Bulgarian', script: 'Cyrillic script', code: 'bg' },
  { language: 'Ukrainian', script: 'Cyrillic script', code: 'uk' },
  { language: 'Macedonian', script: 'Cyrillic script', code: 'mk' },
  // Kazakh is out: a lyric wall exists but no TONGUES locale routes to it.
  { language: 'Kyrgyz', script: 'Cyrillic script', code: 'ky' },
  { language: 'Tajik', script: 'Cyrillic script', code: 'tg' },
  { language: 'Mongolian', script: 'Cyrillic script', code: 'mn' },
  { language: 'Korean', script: 'Hangul', code: 'ko' },
  { language: 'Chinese', script: 'Chinese characters', code: 'zh' },
  { language: 'Japanese', script: 'Japanese kanji and kana', code: 'ja' },
  { language: 'Georgian', script: 'Georgian script', code: 'ka' },
  { language: 'Amharic', script: 'Geʽez script', code: 'am' },
  { language: 'Tigrinya', script: 'Geʽez script', code: 'ti' },
  { language: 'Thai', script: 'Thai script', code: 'th' },
  { language: 'Laotian', script: 'Lao script', code: 'lo' },
  { language: 'Cambodian', script: 'Khmer script', code: 'km' },
  { language: 'Burmese', script: 'Burmese script', code: 'my' },
  { language: 'Hindi', script: 'Devanagari', code: 'hi' },
  { language: 'Nepali', script: 'Devanagari', code: 'ne' },
  { language: 'Bengali', script: 'Bengali script', code: 'bn' },
  { language: 'Tamil', script: 'Tamil script', code: 'ta' },
  { language: 'Sinhalese', script: 'Sinhala script', code: 'si' },
  { language: 'Divehi', script: 'Thaana', code: 'dv' },
  { language: 'Dzongkha', script: 'Tibetan script', code: 'dz' },
  { language: 'Hebrew', script: 'Hebrew script', code: 'he' },
  { language: 'Greek', script: 'Greek alphabet', code: 'el' },
  { language: 'Persian', script: 'Perso-Arabic script', code: 'fa' },
  { language: 'Pashto', script: 'Perso-Arabic script', code: 'ps' },
  { language: 'Urdu', script: 'Perso-Arabic script', code: 'ur' },
]

export const scriptoriumEntry = (language: string): ScriptoriumEntry | undefined =>
  SCRIPTORIUM_POOL.find(entry => entry.language === language)

/**
 * Every country where the language is official — the verdict's answer set.
 * Deliberately unfiltered by playability: like the shared-currency carve-out,
 * a right answer is a right answer even off the current board.
 */
export const scriptoriumAnswers = (language: string): ISOCountryCode[] =>
  Object.keys(COUNTRIES)
    .filter(isValidISOCode)
    .filter(isoCode => COUNTRIES[isoCode].languages?.includes(language))

/** The buyable hint: where the answer countries mostly live. */
export const scriptoriumRegionHint = (language: string): string | undefined => {
  const tally = new Map<string, number>()
  for (const isoCode of scriptoriumAnswers(language)) {
    const label = REGION_LABELS[COUNTRIES[isoCode].region]
    if (label) tally.set(label, (tally.get(label) ?? 0) + 1)
  }
  const [best] = [...tally.entries()].sort((a, b) => b[1] - a[1])
  return best?.[0]
}
