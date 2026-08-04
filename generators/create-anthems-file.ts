import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { COUNTRIES } from '../data/countries.gen'
import { ISOCountryCodes } from '../data/iso-codes.gen'
import { ATTRIBUTION_FREE, corroborates, isPlayable } from './anthem-corroboration'
import type { ISOCountryCode } from '../types/geography.types'
import { captureImageCredit, fetchJson, saveCommonsAudio, wait } from './vendors/wikidata/commons'
import type { MediaCredit } from '../lib/attribution'

/**
 * Pulls each country's national anthem recording from Wikimedia Commons, for
 * the Opening Ceremony buzz round. Countries are found by ISO 3166-1 alpha-2
 * (P297) through one SPARQL query that also carries the anthem's title, its
 * adoption year (P571) and composer (P86) for the round's reveal dossier.
 *
 * Anthem audio hangs off the ANTHEM item (P51), not the country, and a country
 * can hold several anthem statements — historical ones are dropped by their
 * P582 end-time qualifier, so "God Save the King" doesn't deal for a republic
 * that left the Commonwealth.
 *
 * INSTRUMENTALS ARE PREFERRED. A sung anthem leaks the country's language and
 * turns a listening round into a trivial one, so a file whose title says
 * "instrumental" wins over the item's default recording; where only a vocal
 * take exists the country still ships, and lands in the review report below.
 *
 * Clips are trimmed to 30s from the top and saved in two encodings under
 * public/anthems/ — nothing is inlined. Existing files are kept unless --force
 * is passed. Merges with the previous run so a transient failure never erases
 * an anthem an earlier run captured.
 *
 *   bun run generate:anthems [--force]
 */

const OUTPUT_DIRECTORY = 'public/anthems'
const REPORT_PATH = 'generators/data/anthem-report.txt'

export interface AnthemEntry extends MediaCredit {
  /** The anthem's own name, e.g. "Kimigayo". */
  title: string
  /** Public path of the Opus/WebM clip. */
  webm: string
  /** Public path of the AAC/M4A clip, for Safari. */
  m4a: string
  /** Year the anthem was adopted, when Wikidata records one. */
  adoptedYear?: number
  composer?: string
  /** False when only a sung recording was available — the round still deals it,
   *  but the reveal knows the language was audible. */
  instrumental?: boolean
  /** The Commons file this clip came from. Kept so a mismatched anthem is
   *  auditable in the data instead of only being audible in a round. */
  sourceFile?: string
  /**
   * How the file was found. `wikidata` means the anthem ITEM linked it (P51),
   * so the link itself is the provenance and the filename need not spell the
   * country out. `search` means only Commons relevance proposed it — a much
   * weaker signal, so those must corroborate by name (see `anthems.test.ts`).
   */
  sourcedBy?: 'wikidata' | 'search'
}

export type AnthemMapping = { [isoCode in ISOCountryCode]?: AnthemEntry }

const force = process.argv.includes('--force')
const validCodes = new Set<string>(ISOCountryCodes)

let previousMapping: AnthemMapping = {}
try {
  previousMapping = (await import('../data/anthems.gen')).ANTHEMS ?? {}
} catch {
  // First run — nothing to merge
}

/** Current anthem statements only: P582 (end time) marks a former anthem. */
const QUERY = `
SELECT ?iso ?anthemLabel ?audio ?adopted ?composerLabel WHERE {
  ?country wdt:P31 wd:Q6256 ; wdt:P297 ?iso ; p:P85 ?statement .
  ?statement ps:P85 ?anthem .
  FILTER NOT EXISTS { ?statement pq:P582 ?ended }
  OPTIONAL { ?anthem wdt:P51 ?audio }
  OPTIONAL { ?anthem wdt:P571 ?adopted }
  OPTIONAL { ?anthem wdt:P86 ?composer }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`

interface SparqlResponse {
  results: {
    bindings: {
      iso: { value: string }
      anthemLabel?: { value: string }
      audio?: { value: string }
      adopted?: { value: string }
      composerLabel?: { value: string }
    }[]
  }
}

interface SearchResponse {
  query?: { search?: { title: string }[] }
}

/** Commons file name out of a Special:FilePath URL. */
const fileFromUrl = (url: string): string =>
  decodeURIComponent(url.split('/').pop() ?? '').replace(/_/g, ' ')

const isInstrumental = (file: string): boolean => /instrumental|orchestr|band|organ/i.test(file)

/** Last resort for the ~30 countries whose anthem item carries no P51: ask
 *  Commons directly, preferring an instrumental take. Every hit must still
 *  corroborate — an unverifiable match is dropped, not shipped. */
const searchCommonsAudio = async (anthem: string, country: string): Promise<string | undefined> => {
  for (const term of [
    `${anthem} instrumental`,
    `${country} national anthem instrumental`,
    anthem,
  ]) {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search` +
      `&srnamespace=6&srlimit=8&srsearch=${encodeURIComponent(`${term} filetype:audio`)}`
    const response = await fetchJson<SearchResponse>(url)
    const hits = (response?.query?.search ?? [])
      .map(hit => hit.title.replace(/^File:/, ''))
      .filter(file => isPlayable(file) && corroborates(file, anthem, country))
    const best = hits.find(isInstrumental) ?? hits[0]
    if (best) return best
    await wait(250)
  }
  return undefined
}

console.log('Querying Wikidata for national anthems…')
const sparql = await fetchJson<SparqlResponse>(
  `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(QUERY)}`
)
if (!sparql) {
  console.error('Wikidata query failed — leaving data/anthems.gen.ts untouched.')
  process.exit(1)
}

/** One row per country: the best audio among its statements, plus its metadata. */
interface Candidate {
  title: string
  file?: string
  adoptedYear?: number
  composer?: string
}
const candidates = new Map<ISOCountryCode, Candidate>()

for (const row of sparql.results.bindings) {
  const isoCode = row.iso.value.toUpperCase()
  if (!validCodes.has(isoCode)) continue

  const code = isoCode as ISOCountryCode
  const title = row.anthemLabel?.value
  // An unlabelled anthem surfaces as its Q-id; nothing to show in a reveal.
  if (!title || /^Q\d+$/.test(title)) continue

  const file = row.audio ? fileFromUrl(row.audio.value) : undefined
  const year = row.adopted ? Number(row.adopted.value.slice(0, 4)) : undefined
  const existing = candidates.get(code)

  // Prefer an instrumental recording over whatever came first.
  const keepFile =
    file &&
    isPlayable(file) &&
    (!existing?.file || (isInstrumental(file) && !isInstrumental(existing.file)))
      ? file
      : existing?.file

  candidates.set(code, {
    title: existing?.title ?? title,
    file: keepFile,
    adoptedYear: existing?.adoptedYear ?? (Number.isFinite(year) ? year : undefined),
    composer: existing?.composer ?? row.composerLabel?.value,
  })
}

console.log(`${candidates.size} countries have a current anthem on Wikidata.`)

mkdirSync(OUTPUT_DIRECTORY, { recursive: true })

const mapping: AnthemMapping = {}
const vocalPicks: string[] = []
const uncreditedPicks: string[] = []
const missing: string[] = []
let index = 0

for (const [isoCode, candidate] of candidates) {
  index++
  process.stdout.write(`\r  ${index}/${candidates.size} ${isoCode}          `)

  let file = candidate.file
  const sourcedBy: AnthemEntry['sourcedBy'] = file ? 'wikidata' : 'search'
  if (!file) {
    // The country's NAME, never its ISO code: "AF national anthem" means
    // nothing to Commons and simply returns the best-ranked anthem of anyone.
    file = await searchCommonsAudio(candidate.title, COUNTRIES[isoCode]?.name.english ?? isoCode)
    await wait(250)
  }
  if (!file) {
    missing.push(`${isoCode}  ${candidate.title}  (no audio found)`)
    continue
  }

  const clip = await saveCommonsAudio(
    file,
    `${OUTPUT_DIRECTORY}/${isoCode}`,
    `/anthems/${isoCode}`,
    {
      force,
    }
  )
  if (!clip) {
    missing.push(`${isoCode}  ${candidate.title}  (encode failed: ${file})`)
    continue
  }

  const instrumental = isInstrumental(file)
  if (!instrumental) vocalPicks.push(`${isoCode}  ${candidate.title}  ${file}`)

  const credit = await captureImageCredit(file, previousMapping[isoCode], force)
  // A CC BY / BY-SA file MUST name its author to be used at all. Commons
  // sometimes carries the licence without an Artist field, and shipping that is
  // a licence breach — so the country is DROPPED rather than served uncredited.
  if (credit.license && !ATTRIBUTION_FREE.test(credit.license) && !credit.credit) {
    uncreditedPicks.push(`${isoCode}  ${credit.license}  ${file}`)
    for (const extension of ['webm', 'm4a']) {
      const path = `${OUTPUT_DIRECTORY}/${isoCode}.${extension}`
      if (existsSync(path)) rmSync(path)
    }
    await wait(250)
    continue
  }

  mapping[isoCode] = {
    title: candidate.title,
    webm: clip.webm,
    m4a: clip.m4a,
    sourceFile: file,
    sourcedBy,
    ...(candidate.adoptedYear ? { adoptedYear: candidate.adoptedYear } : {}),
    ...(candidate.composer ? { composer: candidate.composer } : {}),
    ...(instrumental ? { instrumental: true } : {}),
    ...credit,
  }
  await wait(250)
}

process.stdout.write('\r')

// Merge with the previous run: fresh wins, gaps keep what an earlier run got.
const droppedForCredit = new Set(uncreditedPicks.map(line => line.slice(0, 2)))
for (const isoCode of ISOCountryCodes) {
  // A country dropped for a missing author must not walk back in off the
  // previous run — the merge would undo the licence check every time.
  if (droppedForCredit.has(isoCode)) continue

  const merged = { ...previousMapping[isoCode], ...mapping[isoCode] }
  if (merged.title && merged.webm && merged.m4a) {
    mapping[isoCode] = { ...merged, title: merged.title, webm: merged.webm, m4a: merged.m4a }
  }
}

writeFileSync(
  'data/anthems.gen.ts',
  `
    import type { AnthemMapping } from '../generators/create-anthems-file'

    export const ANTHEMS: AnthemMapping = ${JSON.stringify(mapping)}
  `
)

const shipped = Object.keys(mapping).length
writeFileSync(
  REPORT_PATH,
  [
    `Anthem generator report — ${shipped} countries shipped an anthem clip.`,
    '',
    `VOCAL RECORDINGS (${vocalPicks.length}) — the sung language may give the answer away.`,
    'Replace with an instrumental take on Commons where one exists.',
    ...vocalPicks.map(line => `  ${line}`),
    '',
    `UNCREDITED UNDER AN ATTRIBUTION LICENCE (${uncreditedPicks.length})`,
    'These need a named author to ship legally, and Commons published none.',
    'Add the Artist on Commons, or replace the file with a public-domain take.',
    ...uncreditedPicks.map(line => `  ${line}`),
    '',
    `NO AUDIO (${missing.length})`,
    ...missing.map(line => `  ${line}`),
    '',
  ].join('\n')
)

console.log(`${shipped} countries have an anthem clip.`)
console.log(`  ${vocalPicks.length} are vocal recordings — see ${REPORT_PATH}`)
if (uncreditedPicks.length) {
  console.warn(`  ${uncreditedPicks.length} lack a required author credit — see ${REPORT_PATH}`)
}
console.log(`  ${missing.length} have no usable audio`)
