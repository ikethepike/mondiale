import type { SourceId } from '~~/lib/attribution'
import type { ISOCountryCode } from './geography.types'

/** Where a speaker share was read: the Factbook's first-language tally, CLDR's
 *  territory usage figure, or a curated row in `data/static/spoken-language-shares.ts`. */
export type SpeakerSource = Extract<
  SourceId,
  'cia-factbook' | 'unicode-cldr' | 'mondiale-editorial'
>

/** One language in one country, as `data/speakers.gen.ts` records it. */
export interface SpeakerRow {
  /**
   * Percent of the population: a first-language figure, or CLDR's usage figure
   * where a statute vouches for the language as the country's own. On a row no
   * source names, CLDR's usage figure alone. Absent where nothing sizes it.
   */
  share?: number
  source?: SpeakerSource
  /** A national statute, or one confined to a region (Croatian in Burgenland). */
  official?: 'national' | 'regional'
  /**
   * The country's own sources name it as one of its languages. Without this the
   * row is a usage figure alone — Sweden's English — which is accepted as an
   * answer but never required.
   */
  named?: true
}

export type SpeakerTable = { [isoCode in ISOCountryCode]?: { [language: string]: SpeakerRow } }
