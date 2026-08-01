import { TONGUE_SAMPLE_SEEDS } from '~~/generators/data/tongue-sample-seeds'

/**
 * The written-sample hint for the Mother Tongue round: a couple of lines of the
 * language in its own script.
 *
 * One home for the lookup so the dealer and any future reveal resolve it the
 * same way — a private copy in either would drift.
 *
 * Two sources, in order:
 *  1. The curated anthem lyric wall for a country whose anthem is sung in this
 *     language (`ANTHEM_LYRICS_BY_LANGUAGE`), fetched by the view.
 *  2. `tongue-sample-seeds.ts`, for languages no anthem is sung in — India's
 *     anthem is Bengali, so Hindi, Marathi, Tamil and Telugu have none.
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
