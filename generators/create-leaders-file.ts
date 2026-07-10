import { mkdirSync, writeFileSync } from 'node:fs'
import { ISOCountryCodes } from '../data/iso-codes.gen'
import type { ISOCountryCode } from '../types/geography.types'
import { fetchJson, saveCommonsImage, wait } from './vendors/wikidata/commons'

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
 * The P35/P6 statements carry a P580 start-time qualifier at day precision,
 * so `sinceDate` needs no SPARQL round-trip — it is already in the claims
 * payload from step 2.
 *
 * Portraits are saved as one dedicated file per country and role under
 * public/leaders/ — nothing is inlined into the data bundle. Existing files
 * are kept unless --force is passed (elections: rerun with --force).
 *
 *   bun run generate:leaders [--force]
 */

const OUTPUT_DIRECTORY = 'public/leaders'
/** Portraits aren't zoomed, but 512px is soft on a HiDPI screen. */
const PORTRAIT_WIDTH = 1024

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
  /**
   * The day this term began (the country's P35/P6 statement's P580), when
   * Wikidata records it to day precision. Used by the country generator to
   * decide whether a CIA world-leaders page predates the current term.
   */
  sinceDate?: string
}

export type LeaderMapping = {
  [isoCode in ISOCountryCode]?: { [role in LeaderRole]?: LeaderEntry }
}

const force = process.argv.includes('--force')
const validCodes = new Set<string>(ISOCountryCodes)

// `fetchJson`, `wait`, `fetchPageImages`, `saveCommonsImage` come from the
// shared wikidata/commons module.
const getJson = fetchJson

// Transient fetch failures must never ERASE a country an earlier run got —
// each run only ever adds or refreshes entries on top of the previous file
let previousMapping: LeaderMapping = {}
try {
  previousMapping = (await import('../data/leaders.gen')).LEADERS ?? {}
} catch {
  // First run — nothing to merge
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
  /** `precision` 11 = day, 10 = month, 9 = year. */
  datavalue?: { value?: { time?: string; precision?: number } }
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

/**
 * The incumbent, plus the day their term began (P580).
 *
 * OPEN statements (no end-date P582) win over rank: a `preferred` statement
 * that has been superseded is still stale, and Wikidata leaves the old one
 * ranked up for months after a transition. Among the open statements, prefer
 * `preferred`, then the most recent start — Bulgaria carries two open P6s.
 *
 * `sinceDate` is what lets the country generator decide whether a CIA page
 * predates the current term. Year alone is not enough: Japan's page is
 * 2025-05-23 and Takaichi took office 2025-10-21 — same year, opposite verdict.
 */
const currentHolder = (statements: Statement[] = []): { leaderId?: string; sinceDate?: string } => {
  const usable = statements.filter(
    statement => statement.rank !== 'deprecated' && statement.mainsnak?.datavalue?.value?.id
  )
  const startTime = (statement: Statement) => statement.qualifiers?.P580?.[0]
  const startYear = (statement: Statement) =>
    yearOf(startTime(statement)?.datavalue?.value?.time) ?? 0

  const open = usable.filter(statement => !statement.qualifiers?.P582)
  const ranked = [...open].sort((a, b) => startYear(b) - startYear(a))
  const chosen =
    open.find(statement => statement.rank === 'preferred') ??
    ranked[0] ??
    usable.find(statement => statement.rank === 'preferred')

  return {
    leaderId: chosen?.mainsnak?.datavalue?.value?.id,
    sinceDate: chosen ? dateOf(startTime(chosen)) : undefined,
  }
}

/** Wikidata times look like "+1955-11-11T00:00:00Z"; pull the leading year. */
const yearOf = (time?: string): number | undefined => {
  if (!time) return undefined
  const match = /^[+-]?(\d{1,4})-/.exec(time)
  const year = match ? Number(match[1]) : NaN
  return Number.isFinite(year) && year > 0 ? year : undefined
}

/**
 * The full ISO date of a Wikidata time value, but only when it is day-precise
 * (precision 11). Coarser values ("2025", "May 2025") would compare wrong
 * against a CIA page date, so they are dropped rather than guessed at.
 */
const dateOf = (snak?: TimeSnak): string | undefined => {
  const value = snak?.datavalue?.value
  if (!value?.time || value.precision !== 11) return undefined
  const match = /^\+(\d{4}-\d{2}-\d{2})T/.exec(value.time)
  return match?.[1]
}

/**
 * A single CURRENT value for a multi-value claim (e.g. party membership P102).
 * Leaders keep historical memberships that lack an end-date in the data too, so
 * "first live statement" grabs a defunct party (Putin/Lukashenka both surface
 * the Communist Party of the Soviet Union). Prefer a preferred-rank statement,
 * else the OPEN (no end-date P582) statement with the most recent start (P580),
 * else fall back to the newest-started of anything live.
 */
const currentClaimId = (statements: Statement[] = []): string | undefined => {
  const live = statements.filter(
    statement => statement.rank !== 'deprecated' && statement.mainsnak?.datavalue?.value?.id
  )
  if (!live.length) return undefined
  const startYear = (statement: Statement) =>
    yearOf(statement.qualifiers?.P580?.[0]?.datavalue?.value?.time) ?? 0

  const preferred = live.find(statement => statement.rank === 'preferred')
  const open = live
    .filter(statement => !statement.qualifiers?.P582)
    .sort((a, b) => startYear(b) - startYear(a))[0]
  const newest = [...live].sort((a, b) => startYear(b) - startYear(a))[0]

  return (preferred ?? open ?? newest)?.mainsnak?.datavalue?.value?.id
}

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
  // Open statements first: a `preferred` rank left on a closed or superseded
  // position outranks the office the person actually holds today.
  const open = live
    .filter(statement => !statement.qualifiers?.P582)
    .sort((a, b) => startYear(b) - startYear(a))

  const chosen =
    open.find(statement => statement.rank === 'preferred') ??
    open[0] ??
    live.find(statement => statement.rank === 'preferred')
  return {
    officeId: chosen?.mainsnak?.datavalue?.value?.id,
    sinceYear: yearOf(chosen?.qualifiers?.P580?.[0]?.datavalue?.value?.time),
  }
}

console.log('Reading current officeholders…')
const holders: {
  isoCode: ISOCountryCode
  role: LeaderRole
  leaderId: string
  sinceDate?: string
}[] = []
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
      const { leaderId, sinceDate } = currentHolder(entity.claims?.[property])
      if (leaderId) holders.push({ isoCode: isoCode as ISOCountryCode, role, leaderId, sinceDate })
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
    const partyId = currentClaimId(entity.claims?.P102)
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
// Also read each entity's dissolution date (P576): a DEFUNCT party must never
// be shown as a current leader's party (Putin/Lukashenka otherwise surface the
// Communist Party of the Soviet Union, dissolved 1991).
const labelById = new Map<string, string>()
const dissolvedIds = new Set<string>()
const idsToResolve = [...referencedIds]
console.log(`Resolving ${idsToResolve.length} office/party labels…`)
for (let index = 0; index < idsToResolve.length; index += 50) {
  const batch = idsToResolve.slice(index, index + 50)
  const data = await getJson<EntityResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=labels|claims&languages=en&languagefallback=1&format=json`
  )
  for (const [id, entity] of Object.entries(data?.entities ?? {})) {
    if (entity.claims?.P576?.some(statement => statement.rank !== 'deprecated')) {
      dissolvedIds.add(id)
    }
    const label = entity.labels?.en?.value
    if (label && !/^Q\d+$/.test(label)) labelById.set(id, label)
  }
  process.stdout.write(`\r  ${Math.min(index + 50, idsToResolve.length)}/${idsToResolve.length}`)
  await wait(200)
}
console.log('')

// --- 4. Assemble the mapping + download portraits ---------------------------
const mapping: LeaderMapping = {}
const portraitQueue: { isoCode: ISOCountryCode; role: LeaderRole; file: string }[] = []

for (const { isoCode, role, leaderId, sinceDate } of holders) {
  const details = leaderDetails.get(leaderId)
  // A bare Q-id is worse than nothing in a quiz
  if (!details?.name || /^Q\d+$/.test(details.name)) continue

  const entry: LeaderEntry = { name: details.name }
  if (details.description) entry.description = details.description
  if (details.bornYear) entry.bornYear = details.bornYear
  if (details.sinceYear) entry.sinceYear = details.sinceYear
  if (sinceDate) entry.sinceDate = sinceDate
  const office = details.officeId ? labelById.get(details.officeId) : undefined
  if (office) entry.office = office
  // Skip a dissolved party (CPSU etc.) — better no party than a defunct one.
  const party =
    details.partyId && !dissolvedIds.has(details.partyId)
      ? labelById.get(details.partyId)
      : undefined
  if (party) entry.party = party

  mapping[isoCode] = { ...mapping[isoCode], [role]: entry }
  if (details.portraitFile) {
    portraitQueue.push({ isoCode, role, file: details.portraitFile })
  }
}

console.log(`Leaders for ${Object.keys(mapping).length} countries; downloading portraits…`)
mkdirSync(OUTPUT_DIRECTORY, { recursive: true })

let done = 0
let failed = 0

// One at a time with a breather between requests — the thumbnail service
// 429s anything resembling parallel load. saveCommonsImage handles the
// keep-existing-unless-force, backoff, and content-type→extension logic.
for (const { isoCode, role, file } of portraitQueue) {
  const roleSlug = role === 'headOfState' ? 'state' : 'government'
  const publicPath = await saveCommonsImage(
    file,
    `${OUTPUT_DIRECTORY}/${isoCode}-${roleSlug}`,
    `/leaders/${isoCode}-${roleSlug}`,
    { width: PORTRAIT_WIDTH, force }
  )
  if (!publicPath) {
    console.warn(`  portrait failed for ${isoCode} ${role}`)
    failed++
    continue
  }
  mapping[isoCode]![role]!.image = publicPath
  done++
  process.stdout.write(`\r  ${done + failed}/${portraitQueue.length} portraits`)
  await wait(250)
}
console.log('')

console.log(`Portraits: ${done} saved, ${failed} failed`)

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
