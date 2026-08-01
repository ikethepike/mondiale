import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import type { AnthemLyrics } from '../types/challenges/group-modes.type'
import type { ISOCountryCode } from '../types/geography.types'

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

const codes = readdirSync(DIRECTORY)
  .filter(name => name.endsWith('-anthem.json'))
  .map(name => {
    const lyrics = JSON.parse(readFileSync(`${DIRECTORY}/${name}`, 'utf8')) as AnthemLyrics
    // The filename is the lookup key, so a file whose contents disagree with it
    // would index the wrong country — the same mismatch anthem-lyrics.test.ts guards.
    if (!name.startsWith(`${lyrics.isoCode}-`))
      throw new Error(`${name} holds ${lyrics.isoCode}: filename and isoCode must agree`)
    return lyrics.isoCode
  })
  .sort() as ISOCountryCode[]

const body = `
    import type { ISOCountryCode } from '~~/types/geography.types'

    /** Countries with a curated lyric wall under public/anthems/lyrics/. */
    export const ANTHEM_LYRICS: ReadonlySet<ISOCountryCode> = new Set(
      ${JSON.stringify(codes)} as ISOCountryCode[]
    )
`

writeFileSync(OUTPUT, body)
console.log(`${OUTPUT}: ${codes.length} lyric walls`)
