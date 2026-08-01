import { ANTHEM_LYRICS_BY_LANGUAGE } from '~~/data/anthem-lyrics.gen'
import { TONGUES } from '~~/data/tongues.gen'
import { TONGUE_SAMPLE_SEEDS } from '~~/generators/data/tongue-sample-seeds'
import type { AnthemLyrics } from '~~/types/challenges/group-modes.type'

/**
 * The written-sample hint for the Mother Tongue round: a couple of lines of the
 * language in its own script.
 *
 * One home for the lookup so the dealer and any future reveal resolve it the
 * same way — a private copy in either would drift.
 *
 * Two sources, in order:
 *  1. `tongue-sample-seeds.ts`, for languages no anthem is sung in — India's
 *     anthem is Bengali, so Hindi, Marathi, Tamil and Telugu have none.
 *  2. The curated lyric wall of a country whose anthem IS sung in it: the view
 *     fetches the file `tongueSampleSource` points at and distils it through
 *     `anthemTongueSample`.
 */
export interface TongueSample {
  /** BCP-47 tag for the `lang` attribute — browsers pick fonts from it. */
  code: string
  script: string
  lines: string[]
}

const BY_LANGUAGE = new Map<string, TongueSample>(
  TONGUE_SAMPLE_SEEDS.map(seed => [
    seed.language,
    { code: seed.code, script: seed.script, lines: seed.lines },
  ])
)

/** The seeded sample for a language, when one exists. */
export const seededTongueSample = (language: string): TongueSample | undefined =>
  BY_LANGUAGE.get(language)

/** How many written lines the hint shows — enough to read the script, not
 *  enough to sing along. */
const SAMPLE_LINES = 2

/**
 * The lyric-wall file a language's written sample can be borrowed from, for
 * languages without a seed: the anthem of a country that sings in it.
 * Deterministic (first listed country), so every player reads the same lines.
 * `TONGUES` keys speech locales like `sv-SE`; the anthem index keys base
 * codes, so the region tag is dropped before the lookup.
 */
export const tongueSampleSource = (language: string): string | undefined => {
  if (BY_LANGUAGE.has(language)) return undefined
  const locale = TONGUES[language]?.locale
  if (!locale) return undefined
  const isoCode = ANTHEM_LYRICS_BY_LANGUAGE[locale.split('-')[0]]?.[0]
  return isoCode ? `/anthems/lyrics/${isoCode}-anthem.json` : undefined
}

/**
 * Distil a fetched lyric wall into the written sample. Lines carrying a
 * `[[masked]]` span are skipped whole: those masks exist because the words
 * inside name the country, and a hint must narrow the field, never point.
 */
export const anthemTongueSample = (lyrics: AnthemLyrics): TongueSample | undefined => {
  const lines = lyrics.verses
    .flatMap(verse => verse.local)
    .filter(line => !line.includes('[['))
    .slice(0, SAMPLE_LINES)
  if (!lines.length) return undefined
  return { code: lyrics.language.code, script: lyrics.language.script, lines }
}
