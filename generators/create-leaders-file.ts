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
 *   1. haswbstatement:P297 search (paginated) → every ISO-carrying entity
 *   2. wbgetentities props=claims (small batches) → ISO + current P35/P6
 *   3. wbgetentities labels (languagefallback!) + pageprops page_image_free
 *   4. Commons Special:FilePath → the images themselves (sequential — 429s)
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
const validCodes = new Set<string>(ISOCountryCodes)
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Transient fetch failures must never ERASE a country an earlier run got —
// each run only ever adds or refreshes entries on top of the previous file
let previousMapping: LeaderMapping = {}
try {
  previousMapping = (await import('../data/leaders.gen')).LEADERS ?? {}
} catch {
  // First run — nothing to merge
}

const getJson = async <T>(url: string, attempt = 1): Promise<T | undefined> => {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  }).catch(() => undefined)

  if (!response?.ok) {
    if (attempt >= 6) {
      console.warn(`  request failed after ${attempt} tries (${response?.status ?? 'network'}): ${url.slice(0, 120)}`)
      return undefined
    }
    // Throttle windows can outlast short backoffs — wait them out properly
    const retryAfter = Number(response?.headers.get('retry-after'))
    await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2500 * attempt)
    return getJson(url, attempt + 1)
  }
  return (await response.json()) as T
}

// --- 1. Every entity carrying an ISO code, in a handful of requests --------
// Per-country searches (194 requests) reliably tripped the API's request
// budget mid-run and whichever countries landed in the throttle window were
// silently lost. One paginated search for ALL items with P297 needs ~6
// requests; the claims fetch below carries the ISO codes to match them up.
interface SearchResponse {
  query?: { search?: { title: string }[] }
  continue?: { sroffset: number }
}

console.log('Listing every entity with an ISO 3166-1 alpha-2 code…')
const entityIds: string[] = []
let offset: number | undefined = 0
while (offset !== undefined) {
  const page: SearchResponse | undefined = await getJson<SearchResponse>(
    `https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      'haswbstatement:P297'
    )}&srnamespace=0&srlimit=50&sroffset=${offset}&format=json`
  )
  entityIds.push(...(page?.query?.search ?? []).map(hit => hit.title))
  offset = page?.continue?.sroffset
  process.stdout.write(`\r  ${entityIds.length} entities`)
  await wait(200)
}
console.log(`\n${entityIds.length} P297 carriers found`)

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

/** P297's value is the ISO string itself. */
const isoCodeOf = (claims?: { [property: string]: Statement[] }): string | undefined => {
  const value = claims?.P297?.find(statement => statement.rank !== 'deprecated')?.mainsnak
    ?.datavalue?.value
  return typeof value === 'string' ? value : undefined
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
const holders: { isoCode: ISOCountryCode; role: LeaderRole; leaderId: string }[] = []
const seenCodes = new Set<string>()

// Batched claims-only fetches: Special:EntityData dumps EVERY language and
// sitelink — for items like the United States that's tens of megabytes and
// it times out reliably. wbgetentities with props=claims is ~1% the size,
// and P297 in the same payload tells us which country each entity is.
for (let index = 0; index < entityIds.length; index += 10) {
  const batch = entityIds.slice(index, index + 10)
  const data = await getJson<EntityResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=claims&format=json`
  )
  for (const entity of Object.values(data?.entities ?? {})) {
    const isoCode = isoCodeOf(entity.claims)
    // Former countries and duplicates: first live claim per code wins
    if (!isoCode || !validCodes.has(isoCode) || seenCodes.has(isoCode)) continue
    seenCodes.add(isoCode)
    for (const [property, role] of Object.entries(LEADER_PROPERTIES)) {
      const leaderId = currentHolder(entity.claims?.[property])
      if (leaderId) holders.push({ isoCode: isoCode as ISOCountryCode, role, leaderId })
    }
  }
  process.stdout.write(`\r  ${Math.min(index + 10, entityIds.length)}/${entityIds.length}`)
  await wait(200)
}
console.log(`\n${holders.length} officeholder statements found`)

// --- 3. Leader entities → names + portrait filenames ------------------------
const leaderIds = [...new Set(holders.map(holder => holder.leaderId))]
const leaderDetails = new Map<string, { name?: string; portraitFile?: string }>()

interface PagePropsResponse {
  query?: {
    pages?: { [pageId: string]: { title?: string; pageprops?: { page_image_free?: string } } }
  }
}

console.log(`Fetching ${leaderIds.length} leader entities…`)
for (let index = 0; index < leaderIds.length; index += 50) {
  const batch = leaderIds.slice(index, index + 50)

  // Names: labels only (a statement-heavy politician's full claims run to
  // tens of MB). languagefallback matters — some items keep their label
  // under the multilingual 'mul' language with no plain 'en' entry at all
  // (this is how the United States went missing: no en label on its
  // president's item).
  const labelData = await getJson<EntityResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=labels&languages=en&languagefallback=1&format=json`
  )
  for (const [id, entity] of Object.entries(labelData?.entities ?? {})) {
    leaderDetails.set(id, { name: entity.labels?.en?.value })
  }

  // Portraits: the PageImages prop is derived from P18 and costs bytes, not
  // megabytes
  const imageData = await getJson<PagePropsResponse>(
    `https://www.wikidata.org/w/api.php?action=query&prop=pageprops&ppprop=page_image_free&titles=${batch.join('|')}&format=json`
  )
  for (const page of Object.values(imageData?.query?.pages ?? {})) {
    if (!page.title || !page.pageprops?.page_image_free) continue
    const details = leaderDetails.get(page.title)
    if (details) details.portraitFile = page.pageprops.page_image_free
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

// Merge with the previous run: fresh data wins per role, gaps keep old data
for (const isoCode of ISOCountryCodes) {
  const merged = { ...previousMapping[isoCode], ...mapping[isoCode] }
  if (Object.keys(merged).length) mapping[isoCode] = merged
}

writeFileSync(
  'data/leaders.gen.ts',
  `
      import type { LeaderMapping } from '../generators/create-leaders-file'
      export const LEADERS: LeaderMapping = ${JSON.stringify(mapping)}
    `
)
console.log(`Wrote data/leaders.gen.ts (${Object.keys(mapping).length} countries)`)

// Silence is how gaps sneak through — name every country that got nothing
const missing = ISOCountryCodes.filter(isoCode => !mapping[isoCode])
if (missing.length) {
  console.warn(`NO LEADER DATA for ${missing.length} countries: ${missing.join(' ')}`)
  console.warn('(transient fetch failures are the usual cause — rerun to fill the gaps)')
}
