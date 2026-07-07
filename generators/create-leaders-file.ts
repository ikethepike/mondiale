import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { ISOCountryCodes } from '../data/iso-codes.gen'
import type { ISOCountryCode } from '../types/geography.types'

/**
 * Pulls every country's CURRENT head of state (P35) and head of government
 * (P6) from Wikidata, with portraits from Wikimedia Commons. Countries are
 * matched by ISO 3166-1 alpha-2 (P297) so there is no name matching.
 *
 * Portraits are saved as one dedicated file per country and role under
 * public/leaders/ — nothing is inlined into the data bundle. Existing files
 * are kept unless --force is passed (elections: rerun with --force).
 *
 *   bun run generators/create-leaders-file.ts [--force]
 */

const USER_AGENT = 'mondiale-game-generator/1.0 (https://github.com/ikethepike/mondiale)'
const OUTPUT_DIRECTORY = 'public/leaders'
const PORTRAIT_WIDTH = 512

type LeaderRole = 'headOfState' | 'headOfGovernment'

interface LeaderEntry {
  name: string
  /** Public path of the portrait file, when one exists on Commons. */
  image?: string
}

export type LeaderMapping = {
  [isoCode in ISOCountryCode]?: { [role in LeaderRole]?: LeaderEntry }
}

/**
 * The public endpoint can't afford the full statement/qualifier walk for
 * many countries at once (504s), so: truthy wdt: properties (preferred rank
 * = the incumbent), small VALUES batches, direct rdfs labels instead of the
 * label service, and patient retries — the endpoint has bad days.
 */
const sparqlQueryFor = (isoCodes: string[]) => `
SELECT ?iso ?role ?leaderLabel ?image WHERE {
  VALUES ?iso { ${isoCodes.map(code => `"${code}"`).join(' ')} }
  ?country wdt:P297 ?iso .
  { ?country wdt:P35 ?leader . BIND("headOfState" AS ?role) }
  UNION
  { ?country wdt:P6 ?leader . BIND("headOfGovernment" AS ?role) }
  OPTIONAL { ?leader wdt:P18 ?image }
  ?leader rdfs:label ?leaderLabel .
  FILTER(LANG(?leaderLabel) = "en")
}`

interface SparqlBinding {
  iso: { value: string }
  role: { value: string }
  leaderLabel?: { value: string }
  image?: { value: string }
}

const isLeaderRole = (role: string): role is LeaderRole =>
  role === 'headOfState' || role === 'headOfGovernment'

const EXTENSION_BY_CONTENT_TYPE: { [contentType: string]: string } = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const force = process.argv.includes('--force')
const validCodes = new Set<string>(ISOCountryCodes)

const BATCH_SIZE = 8
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const fetchBatch = async (isoCodes: string[], attempt = 1): Promise<SparqlBinding[] | undefined> => {
  const response = await fetch(
    `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparqlQueryFor(isoCodes))}`,
    { headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT } }
  ).catch(() => undefined)

  if (!response?.ok) {
    if (attempt >= 5) {
      console.warn(`  batch [${isoCodes.join(' ')}] failed after ${attempt} tries (${response?.status ?? 'network'})`)
      return undefined
    }
    await wait(3000 * attempt)
    return fetchBatch(isoCodes, attempt + 1)
  }
  const payload = (await response.json()) as { results: { bindings: SparqlBinding[] } }
  return payload.results.bindings
}

console.log('Querying Wikidata for current heads of state and government…')
const bindings: SparqlBinding[] = []
const failedBatches: string[][] = []
for (let index = 0; index < ISOCountryCodes.length; index += BATCH_SIZE) {
  const batch = [...ISOCountryCodes.slice(index, index + BATCH_SIZE)]
  const batchBindings = await fetchBatch(batch)
  if (batchBindings) bindings.push(...batchBindings)
  else failedBatches.push(batch)
  process.stdout.write(`\r  ${Math.min(index + BATCH_SIZE, ISOCountryCodes.length)}/${ISOCountryCodes.length} countries queried`)
  await wait(300)
}
console.log('')

// One more patient pass over anything that failed
for (const batch of failedBatches) {
  await wait(5000)
  const retried = await fetchBatch(batch)
  if (retried) bindings.push(...retried)
  else console.warn(`  GIVING UP on [${batch.join(' ')}] — rerun the generator later`)
}

const results = { results: { bindings } }
console.log(`${results.results.bindings.length} statements received`)

// Several current statements can coexist (co-officeholders, data noise) —
// keep one per country and role, preferring entries that carry a portrait.
const mapping: LeaderMapping = {}
const portraitQueue: { isoCode: ISOCountryCode; role: LeaderRole; url: string }[] = []

for (const binding of results.results.bindings) {
  const isoCode = binding.iso.value as ISOCountryCode
  const role = binding.role.value
  const name = binding.leaderLabel?.value
  if (!validCodes.has(isoCode) || !isLeaderRole(role) || !name) continue
  // Unresolved labels come back as bare Q-ids — worse than nothing in a quiz
  if (/^Q\d+$/.test(name)) continue

  const existing = mapping[isoCode]?.[role]
  if (existing && (existing.image || !binding.image)) continue

  const entry: LeaderEntry = { name }
  if (binding.image?.value) {
    entry.image = `/leaders/${isoCode}-${role === 'headOfState' ? 'state' : 'government'}`
    portraitQueue.push({ isoCode, role, url: binding.image.value })
  }

  mapping[isoCode] = { ...mapping[isoCode], [role]: entry }
}

console.log(`Leaders for ${Object.keys(mapping).length} countries; downloading portraits…`)
mkdirSync(OUTPUT_DIRECTORY, { recursive: true })

let downloaded = 0
let skipped = 0
let failed = 0

// Sequential-ish with modest parallelism — Commons is a shared resource
const CONCURRENCY = 4
const queue = [...portraitQueue]
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const task = queue.shift()
    if (!task) break
    const roleSlug = task.role === 'headOfState' ? 'state' : 'government'
    const baseName = `${OUTPUT_DIRECTORY}/${task.isoCode}-${roleSlug}`

    const already = Object.values(EXTENSION_BY_CONTENT_TYPE).find(extension =>
      existsSync(`${baseName}.${extension}`)
    )
    if (already && !force) {
      mapping[task.isoCode]![task.role]!.image = `/leaders/${task.isoCode}-${roleSlug}.${already}`
      skipped++
      continue
    }

    try {
      const portrait = await fetch(`${task.url}?width=${PORTRAIT_WIDTH}`, {
        headers: { 'User-Agent': USER_AGENT },
      })
      if (!portrait.ok) throw new Error(`${portrait.status}`)
      const contentType = portrait.headers.get('content-type')?.split(';')[0] ?? ''
      const extension = EXTENSION_BY_CONTENT_TYPE[contentType] ?? 'jpg'
      writeFileSync(`${baseName}.${extension}`, Buffer.from(await portrait.arrayBuffer()))
      mapping[task.isoCode]![task.role]!.image = `/leaders/${task.isoCode}-${roleSlug}.${extension}`
      downloaded++
    } catch (error) {
      console.warn(`  portrait failed for ${task.isoCode} ${task.role}: ${error}`)
      delete mapping[task.isoCode]![task.role]!.image
      failed++
    }
  }
})
await Promise.all(workers)

console.log(`Portraits: ${downloaded} downloaded, ${skipped} kept, ${failed} failed`)

writeFileSync(
  'data/leaders.gen.ts',
  `
      import type { LeaderMapping } from '../generators/create-leaders-file'
      export const LEADERS: LeaderMapping = ${JSON.stringify(mapping)}
    `
)
console.log(`Wrote data/leaders.gen.ts (${Object.keys(mapping).length} countries)`)
