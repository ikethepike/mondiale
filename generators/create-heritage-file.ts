import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isValidISOCode, type ISOCountryCode } from '../types/geography.types'
import { loadCountryShapes } from './vendors/naturalearth/country-shapes'
import {
  existingImagePath,
  fetchImageDimensions,
  fetchJson,
  fetchPageImages,
  saveCommonsImage,
  wait,
} from './vendors/wikidata/commons'

/**
 * Every UNESCO World Heritage Site on Wikidata (haswbstatement:P1435=Q9259),
 * for the Heritage Hunt pin-drop round. Per site: country (P17),
 * coordinates (P625, validated against the country's polygons like the
 * landmarks generator), inscription year (the P1435 statement's P580
 * qualifier), a one-line English description, and a Commons photo.
 *
 * The full register is ~1,200 sites — more than the game needs and more
 * megabytes than the repo wants. Sites are ranked by Wikipedia sitelink count
 * (fame proxy: the Pyramids over a mining town) and capped per country.
 *
 * Merges with the previous run so a transient failure never erases a site.
 *
 *   bun run generate:heritage [--force]
 */

const OUTPUT_DIRECTORY = 'public/heritage'
/** Shown as a large prompt panel, never pixel-zoomed like landmarks. */
const HERITAGE_WIDTH = 1400
const MIN_IMAGE_WIDTH = 900
const MAX_SITES_PER_COUNTRY = 4
const MAX_KM_OUTSIDE_COUNTRY = 100
const UNESCO_SITE_QID = 'Q9259'

export interface HeritageEntry {
  name: string
  country: ISOCountryCode
  image: string
  /** Point location (P625) — the pin round measures distance to this. */
  coordinates: { lat: number; lng: number }
  /** Year the site entered the World Heritage list (P1435's P580 qualifier). */
  inscribedYear?: number
  /** UNESCO designation, from the criteria (P2614): (i)–(vi) cultural,
   *  (vii)–(x) natural, both mixed. */
  kind?: 'cultural' | 'natural' | 'mixed'
  /** Wikidata's one-line English description, for the reveal. */
  description?: string
}

export type HeritageMapping = { [slug: string]: HeritageEntry }

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const force = process.argv.includes('--force')

let previousMapping: HeritageMapping = {}
try {
  previousMapping = (await import('../data/heritage.gen')).HERITAGE ?? {}
} catch {
  // First run — nothing to merge
}

interface GlobeCoordinate {
  latitude: number
  longitude: number
}
type StatementValue = string | { id?: string } | GlobeCoordinate | undefined
interface Statement {
  rank: 'preferred' | 'normal' | 'deprecated'
  mainsnak?: { datavalue?: { value?: StatementValue } }
  qualifiers?: { [property: string]: { datavalue?: { value?: { time?: string } } }[] }
}
interface Entity {
  claims?: { [property: string]: Statement[] }
  labels?: { en?: { value: string } }
  descriptions?: { en?: { value: string } }
  sitelinks?: { [site: string]: unknown }
}
interface EntityResponse {
  entities?: { [id: string]: Entity }
}

const isGlobeCoordinate = (value: StatementValue): value is GlobeCoordinate =>
  typeof value === 'object' && value !== null && 'latitude' in value

const entityId = (value: StatementValue): string | undefined =>
  typeof value === 'object' && value !== null && 'id' in value ? value.id : undefined

/** Non-deprecated statements, preferred rank first. */
const ranked = (statements: Statement[] = []): Statement[] =>
  statements
    .filter(statement => statement.rank !== 'deprecated')
    .sort((a, b) => (a.rank === 'preferred' ? -1 : 0) - (b.rank === 'preferred' ? -1 : 0))

// --- 1. Country Q-id → ISO map (P297) ----------------------------------------
interface SearchResponse {
  query?: { search?: { title: string }[] }
  continue?: { sroffset: number }
}

const paginatedSearch = async (query: string): Promise<string[]> => {
  const titles: string[] = []
  let offset: number | undefined = 0
  while (offset !== undefined) {
    const page: SearchResponse | undefined = await fetchJson<SearchResponse>(
      `https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        query
      )}&srnamespace=0&srlimit=50&sroffset=${offset}&format=json`
    )
    titles.push(...(page?.query?.search ?? []).map(hit => hit.title))
    offset = page?.continue?.sroffset
    await wait(200)
  }
  return titles
}

console.log('Mapping country Q-ids to ISO codes…')
const countryEntityIds = await paginatedSearch('haswbstatement:P297')
const isoOfQid = new Map<string, ISOCountryCode>()
for (let index = 0; index < countryEntityIds.length; index += 20) {
  const batch = countryEntityIds.slice(index, index + 20)
  const data = await fetchJson<EntityResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=claims&format=json`
  )
  for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
    const value = ranked(entity.claims?.P297)[0]?.mainsnak?.datavalue?.value
    // Wikidata knows more ISO codes than the game does (Greenland, Curaçao,
    // Marshall Islands…) — anything outside the game's set never maps, so its
    // sites are skipped rather than emitted with an untyped country.
    if (isValidISOCode(value) && !isoOfQid.has(qid)) {
      isoOfQid.set(qid, value)
    }
  }
  await wait(200)
}
console.log(`  ${isoOfQid.size} countries mapped`)

// --- 2. Every World Heritage Site, with claims + fame ------------------------
console.log('Finding World Heritage Sites (P1435=Q9259)…')
const siteQids = await paginatedSearch(`haswbstatement:P1435=${UNESCO_SITE_QID}`)
console.log(`  ${siteQids.length} sites listed`)

interface Site {
  qid: string
  name: string
  country: ISOCountryCode
  coordinates: { lat: number; lng: number }
  inscribedYear?: number
  description?: string
  /** Criterion item Q-ids (P2614), resolved to a kind after the sweep. */
  criteria: string[]
  fame: number
}

const sites: Site[] = []
let skipped = 0
for (let index = 0; index < siteQids.length; index += 20) {
  const batch = siteQids.slice(index, index + 20)
  const data = await fetchJson<EntityResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=claims|labels|descriptions|sitelinks&languages=en&languagefallback=1&format=json`
  )
  for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
    const name = entity.labels?.en?.value
    const country = isoOfQid.get(entityId(ranked(entity.claims?.P17)[0]?.mainsnak?.datavalue?.value) ?? '')
    const point = ranked(entity.claims?.P625)[0]?.mainsnak?.datavalue?.value
    if (!name || !country || !isGlobeCoordinate(point)) {
      skipped++
      continue
    }

    // Inscription year: the P580 qualifier on the heritage-status statement.
    const heritageStatement = ranked(entity.claims?.P1435).find(
      statement => entityId(statement.mainsnak?.datavalue?.value) === UNESCO_SITE_QID
    )
    const time = heritageStatement?.qualifiers?.P580?.[0]?.datavalue?.value?.time
    const inscribedYear = time ? Number(time.slice(1, 5)) : undefined

    sites.push({
      qid,
      name,
      country,
      coordinates: { lat: point.latitude, lng: point.longitude },
      ...(inscribedYear && Number.isFinite(inscribedYear) ? { inscribedYear } : {}),
      ...(entity.descriptions?.en?.value ? { description: entity.descriptions.en.value } : {}),
      criteria: ranked(entity.claims?.P2614)
        .map(statement => entityId(statement.mainsnak?.datavalue?.value))
        .filter((id): id is string => !!id),
      fame: Object.keys(entity.sitelinks ?? {}).length,
    })
  }
  process.stdout.write(`\r  ${Math.min(index + 20, siteQids.length)}/${siteQids.length} read`)
  await wait(200)
}
console.log(`\n  ${sites.length} usable (${skipped} without name/country/coords)`)

// --- 2b. Designation kind from the criteria (P2614) ---------------------------
// The ten criterion items carry their roman numeral in the label: (i)–(vi)
// mark cultural value, (vii)–(x) natural; a site holding both is mixed.
const CULTURAL_NUMERALS = new Set(['i', 'ii', 'iii', 'iv', 'v', 'vi'])
const criterionQids = [...new Set(sites.flatMap(site => site.criteria))]
const numeralOfCriterion = new Map<string, string>()
interface LabelResponse {
  entities?: { [id: string]: { labels?: { en?: { value: string } } } }
}
for (let index = 0; index < criterionQids.length; index += 50) {
  const batch = criterionQids.slice(index, index + 50)
  const data = await fetchJson<LabelResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=labels&languages=en&languagefallback=1&format=json`
  )
  for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
    const numeral = entity.labels?.en?.value?.match(/\(([ivx]+)\)/i)?.[1]?.toLowerCase()
    if (numeral) numeralOfCriterion.set(qid, numeral)
  }
  await wait(200)
}

const kindOf = (site: Site): HeritageEntry['kind'] => {
  const numerals = site.criteria
    .map(qid => numeralOfCriterion.get(qid))
    .filter((numeral): numeral is string => !!numeral)
  if (!numerals.length) return undefined
  const cultural = numerals.some(numeral => CULTURAL_NUMERALS.has(numeral))
  const natural = numerals.some(numeral => !CULTURAL_NUMERALS.has(numeral))
  return cultural && natural ? 'mixed' : natural ? 'natural' : 'cultural'
}

// --- 3. Coordinate sanity + fame cap per country ------------------------------
console.log('Validating coordinates against country polygons…')
const shapes = await loadCountryShapes()
const misplaced: Site[] = []
const validated = sites.filter(site => {
  if (!shapes.has(site.country)) return true
  const { lat, lng } = site.coordinates
  if (shapes.contains(site.country, lat, lng)) return true
  if (shapes.distanceToBorderKm(site.country, lat, lng) <= MAX_KM_OUTSIDE_COUNTRY) return true
  misplaced.push(site)
  return false
})
console.log(`  ${validated.length} kept, ${misplaced.length} misplaced`)

const byCountry = new Map<ISOCountryCode, Site[]>()
for (const site of validated) {
  const list = byCountry.get(site.country)
  if (list) list.push(site)
  else byCountry.set(site.country, [site])
}
const chosen: Site[] = []
for (const list of byCountry.values()) {
  chosen.push(...list.sort((a, b) => b.fame - a.fame).slice(0, MAX_SITES_PER_COUNTRY))
}
console.log(`${chosen.length} sites after the top-${MAX_SITES_PER_COUNTRY}-per-country cap`)

// --- 4. Photos + assemble ------------------------------------------------------
const photoFiles = await fetchPageImages(chosen.map(site => site.qid))

mkdirSync(OUTPUT_DIRECTORY, { recursive: true })
const mapping: HeritageMapping = {}
let done = 0
let rejected = 0
let missing = 0

for (const site of chosen) {
  let slug = slugify(site.name)
  // Same-named sites in different countries keep distinct slugs.
  if (mapping[slug]) slug = `${slug}-${site.country.toLowerCase()}`

  let publicPath = force
    ? undefined
    : existingImagePath(`${OUTPUT_DIRECTORY}/${slug}`, `/heritage/${slug}`)

  if (!publicPath) {
    const file = photoFiles.get(site.qid)
    if (!file) {
      missing++
      continue
    }
    const dimensions = await fetchImageDimensions(file)
    if (dimensions && dimensions.width < MIN_IMAGE_WIDTH) {
      rejected++
      await wait(120)
      continue
    }
    publicPath = await saveCommonsImage(file, `${OUTPUT_DIRECTORY}/${slug}`, `/heritage/${slug}`, {
      width: HERITAGE_WIDTH,
      force,
    })
    await wait(250)
  }
  if (!publicPath) {
    missing++
    continue
  }

  const kind = kindOf(site)
  mapping[slug] = {
    name: site.name,
    country: site.country,
    image: publicPath,
    coordinates: {
      lat: Math.round(site.coordinates.lat * 10000) / 10000,
      lng: Math.round(site.coordinates.lng * 10000) / 10000,
    },
    ...(site.inscribedYear ? { inscribedYear: site.inscribedYear } : {}),
    ...(kind ? { kind } : {}),
    ...(site.description ? { description: site.description } : {}),
  }
  done++
  process.stdout.write(`\r  ${done + rejected + missing}/${chosen.length} photos`)
}
console.log(`\nPhotos: ${done} saved, ${rejected} rejected (low-res), ${missing} missing`)

// Merge the previous run (transient-failure insurance), image-on-disk guarded.
const chosenSlugs = new Set(Object.keys(mapping))
let carried = 0
for (const [slug, entry] of Object.entries(previousMapping)) {
  if (chosenSlugs.has(slug)) continue
  if (!existsSync(`public${entry.image}`)) continue
  mapping[slug] = entry
  carried++
}
if (carried) console.log(`Carried ${carried} sites from the previous run`)

const report = [
  `Heritage sites kept per country (cap ${MAX_SITES_PER_COUNTRY}):`,
  ...[...byCountry.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, list]) => {
      const kept = list
        .sort((a, b) => b.fame - a.fame)
        .slice(0, MAX_SITES_PER_COUNTRY)
        .map(site => `${site.name} (${site.fame})`)
      return `${iso}: ${kept.join(' · ')}${list.length > MAX_SITES_PER_COUNTRY ? `  [+${list.length - MAX_SITES_PER_COUNTRY} capped]` : ''}`
    }),
  '',
  `Misplaced (dropped — wrong-country coords) (${misplaced.length}):`,
  ...misplaced.map(site => `  ${site.name} (${site.country}) ${site.qid}`),
  '',
].join('\n')
writeFileSync(join(import.meta.dirname, 'data/heritage-report.txt'), report)

writeFileSync(
  'data/heritage.gen.ts',
  `// Generated by generators/create-heritage-file.ts — do not edit by hand.
import type { HeritageMapping } from '../generators/create-heritage-file'
export const HERITAGE: HeritageMapping = ${JSON.stringify(mapping)}
`
)
console.log(`Wrote data/heritage.gen.ts (${Object.keys(mapping).length} sites)`)
