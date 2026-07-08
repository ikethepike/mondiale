import { mkdirSync, writeFileSync } from 'node:fs'
import { ISOCountryCodes } from '../data/iso-codes.gen'
import type { ISOCountryCode } from '../types/geography.types'
import { fetchJson, fetchPageImages, saveCommonsImage, wait } from './vendors/wikidata/commons'

/**
 * Pulls a representative photo for each country's CAPITAL city from Wikimedia
 * Commons, for the Capital Match / Capital Guess "which country's capital is
 * this?" challenges. Countries are found by ISO 3166-1 alpha-2 (P297); the
 * capital is read straight off the country item's P36 (no name-search
 * collisions), then its P18-derived Commons image is downloaded.
 *
 * Photos are saved one per country under public/capitals/ — nothing is inlined.
 * Existing files are kept unless --force is passed. Merges with the previous
 * run so a transient failure never erases a capital an earlier run captured.
 *
 *   bun run generate:capitals [--force]
 */

const OUTPUT_DIRECTORY = 'public/capitals'
const CAPITAL_WIDTH = 640

export interface CapitalEntry {
  /** Capital city name (from Wikidata labels). */
  name: string
  /** Public path of the photo, when one exists on Commons. */
  image?: string
}

export type CapitalMapping = { [isoCode in ISOCountryCode]?: CapitalEntry }

const force = process.argv.includes('--force')
const validCodes = new Set<string>(ISOCountryCodes)

let previousMapping: CapitalMapping = {}
try {
  previousMapping = (await import('../data/capitals.gen')).CAPITALS ?? {}
} catch {
  // First run — nothing to merge
}

interface Statement {
  rank: 'preferred' | 'normal' | 'deprecated'
  mainsnak?: { datavalue?: { value?: string | { id?: string } } }
  /** P582 = end time; a capital with one is a FORMER capital (Rio for BR). */
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

const isoCodeOf = (claims?: { [property: string]: Statement[] }): string | undefined => {
  const value = claims?.P297?.find(statement => statement.rank !== 'deprecated')?.mainsnak?.datavalue
    ?.value
  return typeof value === 'string' ? value : undefined
}

/**
 * The CURRENT capital Q-id from P36. Countries list historical capitals too
 * (Brazil → Rio de Janeiro with a P582 end-date; Japan → old imperial seats),
 * so prefer a preferred-rank statement, then any open (no end-date) one, before
 * falling back to the first live statement.
 */
const currentCapitalId = (statements: Statement[] = []): string | undefined => {
  const live = statements.filter(
    statement =>
      statement.rank !== 'deprecated' && typeof statement.mainsnak?.datavalue?.value === 'object'
  )
  const idOf = (statement?: Statement) => {
    const value = statement?.mainsnak?.datavalue?.value
    return typeof value === 'object' ? value.id : undefined
  }
  const preferred = live.find(statement => statement.rank === 'preferred')
  const open = live.find(statement => !statement.qualifiers?.P582)
  return idOf(preferred ?? open ?? live[0])
}

// --- 1. Every country entity (has a P297 ISO code) --------------------------
interface SearchResponse {
  query?: { search?: { title: string }[] }
  continue?: { sroffset: number }
}

console.log('Listing every entity with an ISO 3166-1 alpha-2 code…')
const entityIds: string[] = []
let offset: number | undefined = 0
while (offset !== undefined) {
  const page: SearchResponse | undefined = await fetchJson<SearchResponse>(
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

// --- 2. Country → capital Q-id (P36) ----------------------------------------
console.log('Reading capitals (P36)…')
const capitals: { isoCode: ISOCountryCode; capitalQid: string }[] = []
const seenCodes = new Set<string>()

for (let index = 0; index < entityIds.length; index += 10) {
  const batch = entityIds.slice(index, index + 10)
  const data = await fetchJson<EntityResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=claims&format=json`
  )
  for (const entity of Object.values(data?.entities ?? {})) {
    const isoCode = isoCodeOf(entity.claims)
    if (!isoCode || !validCodes.has(isoCode) || seenCodes.has(isoCode)) continue
    seenCodes.add(isoCode)
    const capitalQid = currentCapitalId(entity.claims?.P36)
    if (capitalQid) capitals.push({ isoCode: isoCode as ISOCountryCode, capitalQid })
  }
  process.stdout.write(`\r  ${Math.min(index + 10, entityIds.length)}/${entityIds.length}`)
  await wait(200)
}
console.log(`\n${capitals.length} capitals found`)

// --- 3. Capital entities → names + photo filenames --------------------------
const capitalQids = [...new Set(capitals.map(entry => entry.capitalQid))]
const names = new Map<string, string>()

console.log(`Fetching ${capitalQids.length} capital labels…`)
for (let index = 0; index < capitalQids.length; index += 50) {
  const batch = capitalQids.slice(index, index + 50)
  const data = await fetchJson<EntityResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=labels&languages=en&languagefallback=1&format=json`
  )
  for (const [id, entity] of Object.entries(data?.entities ?? {})) {
    if (entity.labels?.en?.value) names.set(id, entity.labels.en.value)
  }
  process.stdout.write(`\r  ${Math.min(index + 50, capitalQids.length)}/${capitalQids.length}`)
  await wait(200)
}
console.log('')

const photoFiles = await fetchPageImages(capitalQids)

// --- 4. Assemble + download photos ------------------------------------------
mkdirSync(OUTPUT_DIRECTORY, { recursive: true })
const mapping: CapitalMapping = {}
let done = 0
let failed = 0

for (const { isoCode, capitalQid } of capitals) {
  const name = names.get(capitalQid)
  if (!name || /^Q\d+$/.test(name)) continue
  mapping[isoCode] = { name }

  const file = photoFiles.get(capitalQid)
  if (!file) continue
  const publicPath = await saveCommonsImage(
    file,
    `${OUTPUT_DIRECTORY}/${isoCode}`,
    `/capitals/${isoCode}`,
    { width: CAPITAL_WIDTH, force }
  )
  if (!publicPath) {
    failed++
    continue
  }
  mapping[isoCode]!.image = publicPath
  done++
  process.stdout.write(`\r  ${done + failed}/${capitals.length} photos`)
  await wait(250)
}
console.log(`\nPhotos: ${done} saved, ${failed} failed`)

// Merge with the previous run: fresh data wins, gaps keep old data
for (const isoCode of ISOCountryCodes) {
  const merged = { ...previousMapping[isoCode], ...mapping[isoCode] }
  if (Object.keys(merged).length) mapping[isoCode] = merged
}

writeFileSync(
  'data/capitals.gen.ts',
  `
      import type { CapitalMapping } from '../generators/create-capitals-file'
      export const CAPITALS: CapitalMapping = ${JSON.stringify(mapping)}
    `
)
console.log(`Wrote data/capitals.gen.ts (${Object.keys(mapping).length} capitals)`)

const withPhoto = Object.values(mapping).filter(entry => entry?.image).length
console.log(`${withPhoto} capitals have a photo`)
