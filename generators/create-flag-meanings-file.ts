import { writeFileSync } from 'fs'
import { factbookResponses, splitFactbookSections } from '~~/lib/generators/factbook'
import { successfulCombinations } from './link-mapping.gen'

const OUTPUT_FILE = 'data/flag-meanings.gen.ts'

/** Mirrored into the generated file's header — the app imports it from there. */
interface FlagMeaning {
  description?: string
  meaning?: string
  history?: string
}

/**
 * What each country's flag stands for, from the CIA World Factbook's
 * `Government.Flag` node (public domain). ~150 countries carry an explicit
 * `meaning:` section, ~170 a meaning or history; the rest keep only the
 * visual `description`, and reveals must degrade gracefully rather than pass
 * prose off as symbolism.
 *
 *   bun run generate:flag-meanings
 */
const createFlagMeaningsFile = async () => {
  const meanings: { [isoCode: string]: FlagMeaning } = {}

  for await (const { isoCode, data } of factbookResponses(successfulCombinations)) {
    const flag = data.Government.Flag
    if (!flag?.text) {
      console.warn(`No Flag node for ${isoCode}`)
      continue
    }

    // Unsectioned entries (JM, TH, UY) are pure description-style text.
    const sections = splitFactbookSections(flag.text, 'description')
    const entry: FlagMeaning = {}
    if (sections.description) entry.description = sections.description
    if (sections.meaning) entry.meaning = sections.meaning
    if (sections.history) entry.history = sections.history

    if (Object.keys(entry).length) meanings[isoCode] = entry
  }

  const withMeaning = Object.values(meanings).filter(entry => entry.meaning).length
  const withStory = Object.values(meanings).filter(entry => entry.meaning || entry.history).length
  console.log(
    `Flag meanings: ${Object.keys(meanings).length} entries, ${withMeaning} with meaning, ${withStory} with meaning or history`
  )

  writeFileSync(
    OUTPUT_FILE,
    `// This is a generated file, don't touch it.
// Generated at: ${new Date().toISOString()}
import type { ISOCountryCode } from '~~/types/geography.types'

/** What a flag's design stands for, from the CIA World Factbook's Flag node
 *  (public domain). \`meaning\` explains the colours and symbols, \`history\` how
 *  the design came to be; \`description\` is visual prose only — never present
 *  it as symbolism. */
export interface FlagMeaning {
  description?: string
  meaning?: string
  history?: string
}

export const FLAG_MEANINGS: { [key in ISOCountryCode]?: FlagMeaning } = ${JSON.stringify(meanings)}
`
  )
  console.log(`Finished creating file: ${OUTPUT_FILE}`)
}

createFlagMeaningsFile()
