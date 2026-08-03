import { writeFileSync } from 'fs'
import { factbookResponses, stripFactbookMarkup } from '~~/lib/generators/factbook'
import { successfulCombinations } from './link-mapping.gen'

const OUTPUT_FILE = 'data/name-facts.gen.ts'

/** Mirrored into the generated file's header — the app imports it from there. */
interface NameFacts {
  etymology?: string
}

/**
 * Where each country's name comes from, from the CIA World Factbook's
 * `Government.Country name.etymology` node (public domain). Powers the
 * endonym reveal's meaning captions; countries without the node simply
 * skip the caption.
 *
 *   bun run generate:name-facts
 */
const createNameFactsFile = async () => {
  const facts: { [isoCode: string]: NameFacts } = {}

  for await (const { isoCode, data } of factbookResponses(successfulCombinations)) {
    const names = data.Government?.['Country name']
    if (!names) continue

    const etymology = names.etymology?.text && stripFactbookMarkup(names.etymology.text)
    if (etymology) facts[isoCode] = { etymology }
  }

  console.log(`Name facts: ${Object.keys(facts).length} countries with an etymology`)

  writeFileSync(
    OUTPUT_FILE,
    `// This is a generated file, don't touch it.
// Generated at: ${new Date().toISOString()}
import type { ISOCountryCode } from '~~/types/geography.types'

/** Where a country's name comes from, from the CIA World Factbook's
 *  Country name node (public domain). */
export interface NameFacts {
  etymology?: string
}

export const NAME_FACTS: { [key in ISOCountryCode]?: NameFacts } = ${JSON.stringify(facts)}
`
  )
  console.log(`Finished creating file: ${OUTPUT_FILE}`)
}

createNameFactsFile()
