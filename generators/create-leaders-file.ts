import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { ISOCountryCodes } from '../data/iso-codes.gen'
import type { ISOCountryCode } from '../types/geography.types'

/**
 * Pulls every country's CURRENT head of state (P35) and head of government
 * (P6) from Wikidata, with portraits from Wikimedia Commons. Countries are
 * matched by ISO 3166-1 alpha-2 (P297) so there is no name matching.
 *
 * Deliberately avoids the SPARQL query service (Blazegraph — flaky, 60s hard
 * timeouts under load) in favour of the plain Action/REST APIs:
 *   1. haswbstatement:P297=<ISO> search → country Q-id
 *   2. Special:EntityData/<Q>.json     → current P35/P6 statements
 *   3. wbgetentities (50 ids a call)   → leader names + portrait filenames
 *   4. Commons Special:FilePath        → the images themselves
 *
 * Portraits are saved as one dedicated file per country and role under
 * public/leaders/ — nothing is inlined into the data bundle. Existing files
 * are kept unless --force is passed (elections: rerun with --force).
 *
 *   bun run generate:leaders [--force]
 */

const USER_AGENT = 'mondiale-game-generator/1.0 (https://github.com/ikethepike/mondiale)'
const OUTPUT_DIRECTORY = 'public/leaders'
const PORTRAIT_WIDTH = 512
const CONCURRENCY = 6

type LeaderRole = 'headOfState' | 'headOfGovernment'
const LEADER_PROPERTIES: { [property in 'P35' | 'P6']: LeaderRole } = {
  P35: 'headOfState',
  P6: 'headOfGovernment',
}

interface LeaderEntry {
  name: string
  /** Public path of the portrait file, when one exists on Commons. */
  image?: string
}

export type LeaderMapping = {
  [isoCode in ISOCountryCode]?: { [role in LeaderRole]?: LeaderEntry }
}

const force = process.argv.includes('--force')
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const getJson = async <T>(url: string, attempt = 1): Promise<T | undefined> => {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  }).catch(() => undefined)

  if (!response?.ok) {
    if (attempt >= 4) {
      console.warn(`  request failed after ${attempt} tries (${response?.status ?? 'network'}): ${url.slice(0, 120)}`)
      return undefined
    }
    await wait(1500 * attempt)
    return getJson(url, attempt + 1)
  }
  return (await response.json()) as T
}

/** Run tasks over a list with bounded parallelism. */
const inParallel = async <T, R>(items: T[], task: (item: T) => Promise<R>): Promise<R[]> => {
  const queue = [...items]
  const output: R[] = []
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const item = queue.shift()
        if (item === undefined) break
        output.push(await task(item))
      }
    })
  )
  return output
}

// --- 1. ISO → country entity id --------------------------------------------
interface SearchResponse {
  query?: { search?: { title: string }[] }
}

console.log('Resolving country entity ids (P297 search)…')
let resolvedCount = 0
const countryEntities = (
  await inParallel([...ISOCountryCodes], async isoCode => {
    const result = await getJson<SearchResponse>(
      `https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        `haswbstatement:P297=${isoCode}`
      )}&srnamespace=0&srlimit=1&format=json`
    )
    const entityId = result?.query?.search?.[0]?.title
    process.stdout.write(`\r  ${++resolvedCount}/${ISOCountryCodes.length}`)
    return entityId ? { isoCode, entityId } : undefined
  })
).filter((entry): entry is { isoCode: ISOCountryCode; entityId: string } => !!entry)
console.log(`\n${countryEntities.length}/${ISOCountryCodes.length} countries resolved`)

// --- 2. Country entities → current leader statements ------------------------
interface Statement {
  rank: 'preferred' | 'normal' | 'deprecated'
  mainsnak?: { datavalue?: { value?: { id?: string } } }
  qualifiers?: { P582?: unknown[] }
}
interface EntityResponse {
  entities?: {
    [id: string]: {
      claims?: { [property: string]: Statement[] }
      labels?: { en?: { value: string } }
    }
  }
}

/** The incumbent: preferred rank wins; otherwise a normal-rank statement with no end date. */
const currentHolder = (statements: Statement[] = []): string | undefined => {
  const usable = statements.filter(
    statement => statement.rank !== 'deprecated' && statement.mainsnak?.datavalue?.value?.id
  )
  const preferred = usable.find(statement => statement.rank === 'preferred')
  const open = usable.find(statement => !statement.qualifiers?.P582)
  return (preferred ?? open)?.mainsnak?.datavalue?.value?.id
}

console.log('Reading current officeholders…')
let readCount = 0
const holders: { isoCode: ISOCountryCode; role: LeaderRole; leaderId: string }[] = []
await inParallel(countryEntities, async ({ isoCode, entityId }) => {
  const data = await getJson<EntityResponse>(
    `https://www.wikidata.org/wiki/Special:EntityData/${entityId}.json`
  )
  const claims = data?.entities?.[entityId]?.claims
  for (const [property, role] of Object.entries(LEADER_PROPERTIES)) {
    const leaderId = currentHolder(claims?.[property])
    if (leaderId) holders.push({ isoCode, role, leaderId })
  }
  process.stdout.write(`\r  ${++readCount}/${countryEntities.length}`)
})
console.log(`\n${holders.length} officeholder statements found`)

// --- 3. Leader entities → names + portrait filenames ------------------------
const leaderIds = [...new Set(holders.map(holder => holder.leaderId))]
const leaderDetails = new Map<string, { name?: string; portraitFile?: string }>()

console.log(`Fetching ${leaderIds.length} leader entities…`)
for (let index = 0; index < leaderIds.length; index += 50) {
  const batch = leaderIds.slice(index, index + 50)
  const data = await getJson<EntityResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=labels|claims&languages=en&format=json`
  )
  for (const [id, entity] of Object.entries(data?.entities ?? {})) {
    leaderDetails.set(id, {
      name: entity.labels?.en?.value,
      portraitFile: entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value as string | undefined,
    })
  }
  process.stdout.write(`\r  ${Math.min(index + 50, leaderIds.length)}/${leaderIds.length}`)
  await wait(200)
}
console.log('')

// --- 4. Assemble the mapping + download portraits ---------------------------
const EXTENSION_BY_CONTENT_TYPE: { [contentType: string]: string } = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const mapping: LeaderMapping = {}
const portraitQueue: { isoCode: ISOCountryCode; role: LeaderRole; file: string }[] = []

for (const { isoCode, role, leaderId } of holders) {
  const details = leaderDetails.get(leaderId)
  // A bare Q-id is worse than nothing in a quiz
  if (!details?.name || /^Q\d+$/.test(details.name)) continue

  mapping[isoCode] = { ...mapping[isoCode], [role]: { name: details.name } }
  if (details.portraitFile) {
    portraitQueue.push({ isoCode, role, file: details.portraitFile })
  }
}

console.log(`Leaders for ${Object.keys(mapping).length} countries; downloading portraits…`)
mkdirSync(OUTPUT_DIRECTORY, { recursive: true })

let downloaded = 0
let skipped = 0
let failed = 0

/** Commons throttles thumbnail rendering hard — honour 429s with backoff. */
const fetchPortrait = async (file: string, attempt = 1): Promise<Response | undefined> => {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${PORTRAIT_WIDTH}`
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } }).catch(
    () => undefined
  )
  if (response?.ok) return response
  if (attempt >= 6) return undefined

  const retryAfter = Number(response?.headers.get('retry-after'))
  await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2500 * attempt)
  return fetchPortrait(file, attempt + 1)
}

// One at a time with a breather between requests — the thumbnail service
// 429s anything resembling parallel load
for (const { isoCode, role, file } of portraitQueue) {
  const roleSlug = role === 'headOfState' ? 'state' : 'government'
  const baseName = `${OUTPUT_DIRECTORY}/${isoCode}-${roleSlug}`

  const already = Object.values(EXTENSION_BY_CONTENT_TYPE).find(extension =>
    existsSync(`${baseName}.${extension}`)
  )
  if (already && !force) {
    mapping[isoCode]![role]!.image = `/leaders/${isoCode}-${roleSlug}.${already}`
    skipped++
    continue
  }

  const portrait = await fetchPortrait(file)
  if (!portrait) {
    console.warn(`  portrait failed for ${isoCode} ${role}`)
    failed++
    continue
  }

  const contentType = portrait.headers.get('content-type')?.split(';')[0] ?? ''
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType] ?? 'jpg'
  writeFileSync(`${baseName}.${extension}`, Buffer.from(await portrait.arrayBuffer()))
  mapping[isoCode]![role]!.image = `/leaders/${isoCode}-${roleSlug}.${extension}`
  downloaded++
  process.stdout.write(`\r  ${downloaded + skipped + failed}/${portraitQueue.length} portraits`)
  await wait(250)
}
console.log('')

console.log(`Portraits: ${downloaded} downloaded, ${skipped} kept, ${failed} failed`)

writeFileSync(
  'data/leaders.gen.ts',
  `
      import type { LeaderMapping } from '../generators/create-leaders-file'
      export const LEADERS: LeaderMapping = ${JSON.stringify(mapping)}
    `
)
console.log(`Wrote data/leaders.gen.ts (${Object.keys(mapping).length} countries)`)
