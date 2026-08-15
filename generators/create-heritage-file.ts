import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ISOCountryCode } from '../types/geography.types'
import type { HeritageDesignation, HeritageEntry, HeritageMapping } from '../types/places.types'
import { LANDMARKS } from '../data/landmarks.gen'
import { pickMediaCredit } from '../lib/attribution'
import { loadCountryShapes } from './vendors/naturalearth/country-shapes'
import {
  assignFameByCountry,
  carryPreviousPlaces,
  claimValue,
  coordinatesOf,
  entityId,
  fetchCountryQidMap,
  fetchJson,
  fetchLabels,
  fetchPageImages,
  paginatedSearch,
  PLACE_IMAGE_DIRECTORY,
  PLACE_PUBLIC_BASE,
  placeHasPhoto,
  placeSitsInCountry,
  ranked,
  roundCoordinates,
  savePlacePhoto,
  slugify,
  wait,
  writePlacesFile,
  type EntityResponse,
} from './vendors/wikidata/places'

/**
 * Every UNESCO World Heritage Site on Wikidata (haswbstatement:P1435=Q9259),
 * for the Heritage Hunt pin-drop round. Per site: country (P17), coordinates
 * (P625), inscription year (the P1435 statement's P580 qualifier), a one-line
 * English description, and a Commons photo — all of it assembled by the shared
 * place pipeline in vendors/wikidata/places.ts, which the curated landmarks
 * roster rides too.
 *
 * The full register is ~1,200 sites — more than the game needs and more
 * megabytes than the repo wants. Sites are ranked by Wikipedia sitelink count
 * (the fame proxy: the Pyramids over a mining town), capped per country, and
 * that ranking is then stamped onto each entry as an explicit `fame` tier.
 *
 * Photos land in the one place folder (public/landmarks), keyed by slug. A site
 * the curated landmarks roster already holds reuses that photo and its credit
 * rather than fetching a second picture of the same subject.
 *
 * Merges with the previous run so a transient failure never erases a site.
 *
 *   bun run generate:heritage [--force]
 */

const MAX_SITES_PER_COUNTRY = 4
const UNESCO_SITE_QID = 'Q9259'

const force = process.argv.includes('--force')

let previousMapping: HeritageMapping = {}
try {
  previousMapping = (await import('../data/heritage.gen')).HERITAGE ?? {}
} catch {
  // First run — nothing to merge
}

// --- 1. Country Q-id → ISO map (P297) ----------------------------------------
console.log('Mapping country Q-ids to ISO codes…')
const { qidToIso } = await fetchCountryQidMap()
console.log(`  ${qidToIso.size} countries mapped`)

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
  /** Criterion item Q-ids (P2614), resolved to a designation after the sweep. */
  criteria: string[]
  /** Wikipedia sitelink count — the ranking signal behind the fame tier. */
  sitelinks: number
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
    const country = qidToIso.get(entityId(claimValue(entity.claims, 'P17')) ?? '')
    const point = coordinatesOf(entity.claims)
    if (!name || !country || !point) {
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
      coordinates: point,
      ...(inscribedYear && Number.isFinite(inscribedYear) ? { inscribedYear } : {}),
      ...(entity.descriptions?.en?.value ? { description: entity.descriptions.en.value } : {}),
      criteria: ranked(entity.claims?.P2614)
        .map(statement => entityId(statement.mainsnak?.datavalue?.value))
        .filter((id): id is string => !!id),
      sitelinks: Object.keys(entity.sitelinks ?? {}).length,
    })
  }
  process.stdout.write(`\r  ${Math.min(index + 20, siteQids.length)}/${siteQids.length} read`)
  await wait(200)
}
console.log(`\n  ${sites.length} usable (${skipped} without name/country/coords)`)

// --- 2b. Designation from the criteria (P2614) --------------------------------
// The ten criterion items carry their roman numeral in the label: (i)–(vi)
// mark cultural value, (vii)–(x) natural; a site holding both is mixed.
const CULTURAL_NUMERALS = new Set(['i', 'ii', 'iii', 'iv', 'v', 'vi'])
const criterionLabels = await fetchLabels([...new Set(sites.flatMap(site => site.criteria))])
const numeralOfCriterion = new Map<string, string>()
for (const [qid, label] of criterionLabels) {
  const numeral = label.match(/\(([ivx]+)\)/i)?.[1]?.toLowerCase()
  if (numeral) numeralOfCriterion.set(qid, numeral)
}

const designationOf = (site: Site): HeritageDesignation | undefined => {
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
  if (placeSitsInCountry(shapes, site.country, site.coordinates).inside) return true
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
// Sorted by sitelinks so the country's best-known site ranks first — which is
// exactly what assignFameByCountry turns into `major`.
const chosen = assignFameByCountry(
  [...byCountry.values()].flatMap(list =>
    [...list].sort((a, b) => b.sitelinks - a.sitelinks).slice(0, MAX_SITES_PER_COUNTRY)
  )
)
console.log(`${chosen.length} sites after the top-${MAX_SITES_PER_COUNTRY}-per-country cap`)

// --- 4. Photos + assemble ------------------------------------------------------
const photoFiles = await fetchPageImages(chosen.map(site => site.qid))

mkdirSync(PLACE_IMAGE_DIRECTORY, { recursive: true })
const mapping: HeritageMapping = {}
let done = 0
let rejected = 0
let missing = 0
let reused = 0

for (const site of chosen) {
  let slug = slugify(site.name)
  // Same-named sites in different countries keep distinct slugs.
  if (mapping[slug]) slug = `${slug}-${site.country.toLowerCase()}`

  // The curated roster already ships this subject: take its file and its
  // credit rather than fetching a second photo of the same place.
  const curated = LANDMARKS[slug]
  const photo = curated
    ? ({ status: 'existing', image: curated.image, media: pickMediaCredit(curated) ?? {} } as const)
    : await savePlacePhoto({
        file: photoFiles.get(site.qid),
        slug,
        directory: PLACE_IMAGE_DIRECTORY,
        publicBase: PLACE_PUBLIC_BASE,
        previous: previousMapping[slug],
        force,
      })
  if (curated) reused++
  if (photo.status === 'rejected') {
    rejected++
    continue
  }
  if (!placeHasPhoto(photo)) {
    missing++
    continue
  }

  const designation = designationOf(site)
  mapping[slug] = {
    name: site.name,
    country: site.country,
    image: photo.image,
    fame: site.fame,
    ...photo.media,
    coordinates: roundCoordinates(site.coordinates),
    ...(site.inscribedYear ? { inscribedYear: site.inscribedYear } : {}),
    ...(designation ? { designation } : {}),
    ...(site.description ? { description: site.description } : {}),
  }
  done++
  process.stdout.write(`\r  ${done + rejected + missing}/${chosen.length} photos`)
  if (photo.status === 'saved') await wait(250)
}
console.log(
  `\nPhotos: ${done} saved (${reused} reused from the landmarks roster), ${rejected} rejected (low-res), ${missing} missing`
)

const carried = carryPreviousPlaces<HeritageEntry>(mapping, previousMapping)
if (carried) console.log(`Carried ${carried} sites from the previous run`)

const report = [
  `Heritage sites kept per country (cap ${MAX_SITES_PER_COUNTRY}):`,
  ...[...byCountry.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, list]) => {
      const kept = [...list]
        .sort((a, b) => b.sitelinks - a.sitelinks)
        .slice(0, MAX_SITES_PER_COUNTRY)
        .map(
          (site, rank) =>
            `${site.name} (${site.sitelinks}, ${['major', 'minor'][rank] ?? 'obscure'})`
        )
      return `${iso}: ${kept.join(' · ')}${list.length > MAX_SITES_PER_COUNTRY ? `  [+${list.length - MAX_SITES_PER_COUNTRY} capped]` : ''}`
    }),
  '',
  `Misplaced (dropped — wrong-country coords) (${misplaced.length}):`,
  ...misplaced.map(site => `  ${site.name} (${site.country}) ${site.qid}`),
  '',
].join('\n')
writeFileSync(join(import.meta.dirname, 'data/heritage-report.txt'), report)

writePlacesFile({
  path: 'data/heritage.gen.ts',
  generator: 'generators/create-heritage-file.ts',
  typeImport: '~~/types/places.types',
  constant: 'HERITAGE',
  type: 'HeritageMapping',
  mapping,
})
