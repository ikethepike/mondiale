import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { ISOCountryCodes } from '../data/iso-codes.gen'
import type { AnthemLyrics } from '../types/challenges/group-modes.type'
import type { ISOCountryCode } from '../types/geography.types'

/** The board's own codes: a curated file may cover a country the game doesn't
 *  play, and indexing it would hand the dealer an unresolvable ISO code. */
const validCodes = new Set<string>(ISOCountryCodes)

/**
 * Indexes the curated lyric walls under public/anthems/lyrics/ so the dealer
 * knows which countries have one.
 *
 * The list is generated rather than hand-kept: a file that ships without an
 * entry never shows its wall, and an entry without a file fetches a 404 mid
 * round. Both fail silently, so the folder is the single source of truth and
 * this only writes down what is actually there.
 *
 *   bun run generate:anthem-lyrics
 */

const DIRECTORY = 'public/anthems/lyrics'
const OUTPUT = 'data/anthem-lyrics.gen.ts'

const files = readdirSync(DIRECTORY)
  .filter(name => name.endsWith('-anthem.json'))
  .map(name => {
    const lyrics = JSON.parse(readFileSync(`${DIRECTORY}/${name}`, 'utf8')) as AnthemLyrics
    // The filename is the lookup key, so a file whose contents disagree with it
    // would index the wrong country — the same mismatch anthem-lyrics.test.ts guards.
    if (!name.startsWith(`${lyrics.isoCode}-`))
      throw new Error(`${name} holds ${lyrics.isoCode}: filename and isoCode must agree`)
    return lyrics
  })

const codes = files
  .map(lyrics => lyrics.isoCode)
  .filter(isoCode => validCodes.has(isoCode))
  .sort() as ISOCountryCode[]

/**
 * Reverse index: BCP-47 language code → the countries whose anthem is SUNG in
 * it. Mother Tongue knows a language and needs a country; the files are keyed
 * the other way round, so without this the two can't meet.
 *
 * Note that an anthem is often not in the country's main spoken language —
 * Ireland's is Irish, India's is Bengali — so this is genuinely a different
 * mapping from "who speaks what", not a shortcut to it.
 */
const byLanguage: { [code: string]: ISOCountryCode[] } = {}
for (const lyrics of files) {
  const code = lyrics.language?.code
  // Only codes the game itself plays. A few curated files cover countries
  // outside Mondiale's board (VC, WS, MH), and indexing them would hand the
  // dealer an ISO code no lookup can resolve.
  if (!code || !validCodes.has(lyrics.isoCode)) continue
  byLanguage[code] = [...(byLanguage[code] ?? []), lyrics.isoCode].sort()
}

const body = `
    import type { ISOCountryCode } from '~~/types/geography.types'

    /** Countries with a curated lyric wall under public/anthems/lyrics/. */
    export const ANTHEM_LYRICS: ReadonlySet<ISOCountryCode> = new Set(
      ${JSON.stringify(codes)} as ISOCountryCode[]
    )

    /** BCP-47 language code → countries whose anthem is sung in that language. */
    export const ANTHEM_LYRICS_BY_LANGUAGE: {
      readonly [code: string]: readonly ISOCountryCode[]
    } = ${JSON.stringify(byLanguage)}
`

writeFileSync(OUTPUT, body)
console.log(`${OUTPUT}: ${codes.length} lyric walls`)
