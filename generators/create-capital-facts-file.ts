import { writeFileSync } from 'fs'
import { factbookResponses, stripFactbookMarkup } from '~~/lib/generators/factbook'
import { successfulCombinations } from './link-mapping.gen'

const OUTPUT_FILE = 'data/capital-facts.gen.ts'

/** Mirrored into the generated file's header — the app imports it from there. */
interface CapitalFacts {
  etymology?: string
  timezone?: string
}

/** "UTC+1 (6 hours ahead of Washington, DC…)" → "UTC+1". */
const timezoneOf = (text: string | undefined): string | undefined => {
  const match = text?.match(/UTC[+−-][\d:.]+|UTC\b/)
  return match?.[0]?.replace('−', '-')
}

/**
 * The capital dossier's narrative facts, from the CIA World Factbook's
 * `Government.Capital` node (public domain): the name's etymology and the
 * capital's timezone. Display names and photos stay with capitals.gen.ts
 * (Wikidata/Commons); population and coordinates come from cities.gen.ts.
 *
 *   bun run generate:capital-facts
 */
const createCapitalFactsFile = async () => {
  const facts: { [isoCode: string]: CapitalFacts } = {}

  for await (const { isoCode, data } of factbookResponses(successfulCombinations)) {
    const capital = data.Government.Capital
    if (!capital) continue

    const entry: CapitalFacts = {}
    const etymology = capital.etymology?.text && stripFactbookMarkup(capital.etymology.text)
    if (etymology) entry.etymology = etymology
    const timezone = timezoneOf(capital['time difference']?.text)
    if (timezone) entry.timezone = timezone
    if (Object.keys(entry).length) facts[isoCode] = entry
  }

  const withEtymology = Object.values(facts).filter(entry => entry.etymology).length
  console.log(
    `Capital facts: ${Object.keys(facts).length} entries, ${withEtymology} with etymology`
  )

  writeFileSync(
    OUTPUT_FILE,
    `// This is a generated file, don't touch it.
// Generated at: ${new Date().toISOString()}
import type { ISOCountryCode } from '~~/types/geography.types'

/** Narrative capital facts from the CIA World Factbook's Capital node (public
 *  domain): what the name means and the capital's UTC offset. */
export interface CapitalFacts {
  etymology?: string
  timezone?: string
}

export const CAPITAL_FACTS: { [key in ISOCountryCode]?: CapitalFacts } = ${JSON.stringify(facts)}
`
  )
  console.log(`Finished creating file: ${OUTPUT_FILE}`)
}

createCapitalFactsFile()
