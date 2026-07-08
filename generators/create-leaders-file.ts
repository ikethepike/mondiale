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
  /** Wikidata one-line description, e.g. "President of France". */
  description?: string
  /** Birth year (from P569), for an age line. */
  bornYear?: number
  /** Current office/position label (from P39), e.g. "President of Ghana". */
  office?: string
  /** Political party label (from P102). */
  party?: string
  /** Year they took the current office (P39's P580 start-time qualifier). */
  sinceYear?: number
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
  mainsnak?: { datavalue?: { value?: { id?: string; time?: string } } }
  qualifiers?: { P582?: unknown[]; P580?: TimeSnak[] }
}
interface TimeSnak {
  datavalue?: { value?: { time?: string } }
}
interface EntityResponse {
  entities?: {
    [id: string]: {
      claims?: { [property: string]: Statement[] }
      labels?: { en?: { value: string } }
      descriptions?: { en?: { value: string } }
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

/** Wikidata times look like "+1955-11-11T00:00:00Z"; pull the leading year. */
const yearOf = (time?: string): number | undefined => {
  if (!time) return undefined
  const match = /^[+-]?(\d{1,4})-/.exec(time)
  const year = match ? Number(match[1]) : NaN
  return Number.isFinite(year) && year > 0 ? year : undefined
}

/** Single-value claim: the first live statement's referenced Q-id. */
const firstClaimId = (statements: Statement[] = []): string | undefined =>
  statements.find(
    statement => statement.rank !== 'deprecated' && statement.mainsnak?.datavalue?.value?.id
  )?.mainsnak?.datavalue?.value?.id

/**
 * The person's CURRENT top office (P39). Politicians hold many positions and
 * several often lack an end-date (P582), so "first open statement" grabs junk
 * like a decades-old council seat. Prefer a preferred-rank statement; otherwise
 * the open position with the MOST RECENT start date (P580) — a sitting
 * president took office more recently than an old local role. Returns the
 * office Q-id + start year, so we can show "President of Ghana · since 2019".
 */
const currentPosition = (
  statements: Statement[] = []
): { officeId?: string; sinceYear?: number } => {
  const live = statements.filter(
    statement => statement.rank !== 'deprecated' && statement.mainsnak?.datavalue?.value?.id
  )
  const startYear = (statement: Statement) =>
    yearOf(statement.qualifiers?.P580?.[0]?.datavalue?.value?.time) ?? 0

  // Most-recent open position. This can be a legislative SEAT (MP, Bundestag
  // member) whose start date outranks the actual executive office — the office
  // label can't be read here (it's a Q-id resolved later), so the CLIENT
  // prefers the authoritative `description` line ("Prime Minister of X") over
  // this office when they disagree (see lib/leaders.ts `leaderTitle`).
  const preferred = live.find(statement => statement.rank === 'preferred')
  const open = live
    .filter(statement => !statement.qualifiers?.P582)
    .sort((a, b) => startYear(b) - startYear(a))[0]

  const chosen = preferred ?? open
  return {
    officeId: chosen?.mainsnak?.datavalue?.value?.id,
    sinceYear: yearOf(chosen?.qualifiers?.P580?.[0]?.datavalue?.value?.time),
  }
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

// --- 3. Leader entities → names, portraits, profile facts -------------------
const leaderIds = [...new Set(holders.map(holder => holder.leaderId))]
interface LeaderDetail {
  name?: string
  portraitFile?: string
  description?: string
  bornYear?: number
  officeId?: string
  partyId?: string
  sinceYear?: number
}
const leaderDetails = new Map<string, LeaderDetail>()
// Office (P39) and party (P102) resolve to Q-ids — collect them, then look up
// their labels in one follow-up batch pass.
const referencedIds = new Set<string>()

interface PagePropsResponse {
  query?: {
    pages?: { [pageId: string]: { title?: string; pageprops?: { page_image_free?: string } } }
  }
}

console.log(`Fetching ${leaderIds.length} leader entities…`)
for (let index = 0; index < leaderIds.length; index += 40) {
  const batch = leaderIds.slice(index, index + 40)

  // labels + descriptions + the handful of profile claims (birth, office,
  // party). languagefallback matters — some items keep their label under the
  // multilingual 'mul' language with no plain 'en' entry at all (this is how
  // the United States went missing: no en label on its president's item).
  // We request only these props, not the full entity — a politician's whole
  // claim set can run to megabytes, but this subset is small.
  const data = await getJson<EntityResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=labels|descriptions|claims&languages=en&languagefallback=1&format=json`
  )
  for (const [id, entity] of Object.entries(data?.entities ?? {})) {
    const position = currentPosition(entity.claims?.P39)
    const partyId = firstClaimId(entity.claims?.P102)
    if (position.officeId) referencedIds.add(position.officeId)
    if (partyId) referencedIds.add(partyId)
    leaderDetails.set(id, {
      name: entity.labels?.en?.value,
      description: entity.descriptions?.en?.value,
      bornYear: yearOf(entity.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time),
      officeId: position.officeId,
      partyId,
      sinceYear: position.sinceYear,
    })
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

  process.stdout.write(`\r  ${Math.min(index + 40, leaderIds.length)}/${leaderIds.length}`)
  await wait(200)
}
console.log('')

// --- 3b. Resolve office + party Q-ids to labels -----------------------------
const labelById = new Map<string, string>()
const idsToResolve = [...referencedIds]
console.log(`Resolving ${idsToResolve.length} office/party labels…`)
for (let index = 0; index < idsToResolve.length; index += 50) {
  const batch = idsToResolve.slice(index, index + 50)
  const data = await getJson<EntityResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=labels&languages=en&languagefallback=1&format=json`
  )
  for (const [id, entity] of Object.entries(data?.entities ?? {})) {
    const label = entity.labels?.en?.value
    if (label && !/^Q\d+$/.test(label)) labelById.set(id, label)
  }
  process.stdout.write(`\r  ${Math.min(index + 50, idsToResolve.length)}/${idsToResolve.length}`)
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

  const entry: LeaderEntry = { name: details.name }
  if (details.description) entry.description = details.description
  if (details.bornYear) entry.bornYear = details.bornYear
  if (details.sinceYear) entry.sinceYear = details.sinceYear
  const office = details.officeId ? labelById.get(details.officeId) : undefined
  if (office) entry.office = office
  const party = details.partyId ? labelById.get(details.partyId) : undefined
  if (party) entry.party = party

  mapping[isoCode] = { ...mapping[isoCode], [role]: entry }
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
