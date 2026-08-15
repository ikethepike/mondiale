import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pickMediaCredit, type MediaCredit } from '../lib/attribution'
import type { ISOCountryCode } from '../types/geography.types'
import type {
  CuratedFacet,
  HeritageDesignation,
  PlaceEntry,
  PlaceMapping,
  UnescoFacet,
} from '../types/places.types'
import { LANDMARK_FACTS } from './data/landmark-facts'
import { LANDMARK_SEEDS } from './data/landmark-seeds'
import { loadCountryShapes } from './vendors/naturalearth/country-shapes'
import { resolveQidBySearch, saveImageUrl } from './vendors/wikidata/commons'
import { hasUnsplashKey, saveUnsplashImage, saveUnsplashPhoto } from './vendors/unsplash/unsplash'
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
  placeHasPhoto,
  placeSitsInCountry,
  PLACE_IMAGE_DIRECTORY,
  PLACE_PHOTO_WIDTH,
  PLACE_PUBLIC_BASE,
  ranked,
  roundCoordinates,
  savePlacePhoto,
  slugify,
  wait,
  writePlacesFile,
  type EntityResponse,
} from './vendors/wikidata/places'

/**
 * The one roster of photographed places, from its two selections:
 *
 *   - the hand-curated landmark seeds (generators/data/landmark-seeds), whose
 *     Q-id is resolved by name and disambiguated by P17 against the seed's ISO
 *     so a shared name never grabs the item in the wrong country
 *   - every UNESCO World Heritage Site on Wikidata (P1435=Q9259), ranked by
 *     Wikipedia sitelink count and capped per country — the full register is
 *     ~1,200 sites, more than the game needs and more megabytes than the repo
 *     wants
 *
 * These ran as two generators writing two files, and sixty subjects existed in
 * both: two entries, two photos of the same place, each holding half the facts.
 * They are one entry with two facets now, so the country sweep runs once, a
 * photo is fetched once, and a subject on both rosters is credited once.
 *
 * Photos live one per slug under public/landmarks/. Merges with the previous
 * run so a transient failure never erases a captured place.
 *
 *   bun run generate:places [--force]
 */

const MAX_SITES_PER_COUNTRY = 4
const UNESCO_SITE_QID = 'Q9259'

const force = process.argv.includes('--force')

let previousMapping: PlaceMapping = {}
try {
  previousMapping = (await import('../data/places.gen')).PLACES ?? {}
} catch {
  // First run — nothing to merge
}

// --- 1. The country map, once for both selections ----------------------------
console.log('Mapping countries to Wikidata Q-ids…')
const { isoToQid, qidToIso } = await fetchCountryQidMap()
console.log(`  ${isoToQid.size} countries mapped`)

// =============================================================================
// Selection A — the curated landmark seeds
// =============================================================================

console.log(`\nResolving ${LANDMARK_SEEDS.length} curated landmark Q-ids…`)
const seedHasImageOverride = (seed: (typeof LANDMARK_SEEDS)[number]) =>
  !!(seed.imageUrl || seed.unsplashPhotoId || seed.unsplash || seed.commons)

const seeds: { seed: (typeof LANDMARK_SEEDS)[number]; qid: string }[] = []
for (const seed of LANDMARK_SEEDS) {
  // A pinned qid is the answer; searching for it could only get it wrong.
  const qid =
    seed.qid ??
    (await resolveQidBySearch(seed.name, { contextCountryQid: isoToQid.get(seed.country) }))
  // The Q-id only supplies the fallback photo and the P131 city label, so an
  // overridden seed still belongs in the run even when its name doesn't
  // resolve — it just loses the `city` field.
  if (qid) seeds.push({ seed, qid })
  else if (seedHasImageOverride(seed)) seeds.push({ seed, qid: '' })
  else console.warn(`  no Q-id for "${seed.name}" (${seed.country})`)
  await wait(150)
}

console.log('Reading curated locations (P131) and coordinates (P625)…')
const locationQidOf = new Map<string, string>()
const locationLabelQids = new Set<string>()
const coordinateOf = new Map<string, { lat: number; lng: number }>()
// Overridden seeds may carry an empty qid — never send those to the API.
const seedQids = seeds.map(entry => entry.qid).filter(Boolean)
for (let index = 0; index < seedQids.length; index += 30) {
  const batch = seedQids.slice(index, index + 30)
  const data = await fetchJson<EntityResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=claims&format=json`
  )
  for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
    const locationQid = entityId(claimValue(entity.claims, 'P131'))
    if (locationQid) {
      locationQidOf.set(qid, locationQid)
      locationLabelQids.add(locationQid)
    }
    // P625 rides along in this same response — free.
    const point = coordinatesOf(entity.claims)
    if (point) coordinateOf.set(qid, point)
  }
  await wait(200)
}
const locationLabels = await fetchLabels([...locationLabelQids])

console.log('Validating curated coordinates against country polygons…')
const shapes = await loadCountryShapes()
let misplacedSeeds = 0

for (const entry of seeds) {
  const { seed, qid } = entry
  const point = coordinateOf.get(qid)
  if (!point) continue
  const verdict = placeSitsInCountry(shapes, seed.country, point)
  if (verdict.inside) continue

  // Too far out to be coastline slop: resolveQidBySearch matched the wrong
  // item. That Q-id also supplies the photo and the city, so disown it whole
  // rather than keep a place illustrated with another country's picture.
  // Blanking the qid leaves the seed alive only if it has an image override —
  // otherwise it's dropped, which is the right outcome for a bad match.
  console.warn(
    `  ✗ "${seed.name}" (${seed.country}) sits ${Math.round(verdict.kmOutside)}km outside its country — wrong Wikidata item (${qid})`
  )
  coordinateOf.delete(qid)
  locationQidOf.delete(qid)
  entry.qid = ''
  misplacedSeeds++

  // An image already downloaded from the bad Q-id is another country's photo
  // (Ecuador was shipping Shibam, Yemen). Existing files short-circuit the
  // download, so it would survive forever — delete it. A seed with an explicit
  // override owns its image and is left alone.
  if (seedHasImageOverride(seed)) continue
  const stalePath = `${PLACE_IMAGE_DIRECTORY}/${slugify(seed.name)}.webp`
  if (existsSync(stalePath)) {
    rmSync(stalePath, { force: true })
    console.warn(`    removed its cached image — add an image override to keep this place`)
  }
}
console.log(
  `  ${coordinateOf.size} coordinates kept, ${misplacedSeeds} wrong-item matches disowned`
)

// The seed file lists each country's icon first, and that order is the fame
// signal — stamped here so nothing downstream has to preserve array order.
const curatedRoster = assignFameByCountry(
  seeds.map(({ seed, qid }) => ({ ...seed, qid, country: seed.country }))
)

// =============================================================================
// Selection B — the UNESCO World Heritage register
// =============================================================================

console.log('\nFinding World Heritage Sites (P1435=Q9259)…')
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

console.log('Validating heritage coordinates against country polygons…')
const misplacedSites: Site[] = []
const validated = sites.filter(site => {
  if (placeSitsInCountry(shapes, site.country, site.coordinates).inside) return true
  misplacedSites.push(site)
  return false
})
console.log(`  ${validated.length} kept, ${misplacedSites.length} misplaced`)

const byCountry = new Map<ISOCountryCode, Site[]>()
for (const site of validated) {
  const list = byCountry.get(site.country)
  if (list) list.push(site)
  else byCountry.set(site.country, [site])
}
// Sorted by sitelinks so the country's best-known site ranks first — which is
// exactly what assignFameByCountry turns into `major`.
const heritageRoster = assignFameByCountry(
  [...byCountry.values()].flatMap(list =>
    [...list].sort((a, b) => b.sitelinks - a.sitelinks).slice(0, MAX_SITES_PER_COUNTRY)
  )
)
console.log(
  `  ${heritageRoster.length} sites after the top-${MAX_SITES_PER_COUNTRY}-per-country cap`
)

// =============================================================================
// One roster: merge by slug, one photo each
// =============================================================================

/** What each selection contributes to a slug, before the photo pass. */
interface Draft {
  slug: string
  name: string
  country: ISOCountryCode
  coordinates?: { lat: number; lng: number }
  description?: string
  curated?: CuratedFacet
  unesco?: UnescoFacet
  /** The Q-id whose Commons photo illustrates this place. */
  photoQid: string
  /** Curated seeds may pin their own image; the sweep never does. */
  seed?: (typeof LANDMARK_SEEDS)[number]
}

const drafts = new Map<string, Draft>()

for (const entry of curatedRoster) {
  const slug = slugify(entry.name)
  const city = locationQidOf.get(entry.qid)
    ? locationLabels.get(locationQidOf.get(entry.qid)!)
    : undefined
  drafts.set(slug, {
    slug,
    name: entry.name,
    country: entry.country,
    ...(coordinateOf.get(entry.qid) ? { coordinates: coordinateOf.get(entry.qid) } : {}),
    ...(LANDMARK_FACTS[slug] ? { description: LANDMARK_FACTS[slug] } : {}),
    curated: { fame: entry.fame, kind: entry.kind, ...(city ? { city } : {}) },
    photoQid: entry.qid,
    seed: entry,
  })
}

let sharedSubjects = 0
for (const site of heritageRoster) {
  let slug = slugify(site.name)
  const existing = drafts.get(slug)
  // A slug already taken by a place in ANOTHER country is a different subject
  // that happens to share a name — give the site its own.
  if (existing && existing.country !== site.country) slug = `${slug}-${site.country.toLowerCase()}`

  const designation = designationOf(site)
  const facet: UnescoFacet = {
    fame: site.fame,
    ...(site.inscribedYear ? { inscribedYear: site.inscribedYear } : {}),
    ...(designation ? { designation } : {}),
  }

  const draft = drafts.get(slug)
  if (draft) {
    // Same subject, both rosters. The curated identity wins — its name, its
    // prose and its photo were chosen by hand — and the sweep contributes its
    // facet plus anything the curation left blank.
    draft.unesco = facet
    draft.description ??= site.description
    draft.coordinates ??= roundCoordinates(site.coordinates)
    sharedSubjects++
    continue
  }
  drafts.set(slug, {
    slug,
    name: site.name,
    country: site.country,
    coordinates: roundCoordinates(site.coordinates),
    ...(site.description ? { description: site.description } : {}),
    unesco: facet,
    photoQid: site.qid,
  })
}
console.log(
  `\n${drafts.size} places: ${curatedRoster.length} curated + ${heritageRoster.length} heritage, ${sharedSubjects} of them the same subject`
)

// --- Photos, one per slug ------------------------------------------------------
const photoFiles = await fetchPageImages(
  [...drafts.values()].map(draft => draft.photoQid).filter(Boolean)
)

mkdirSync(PLACE_IMAGE_DIRECTORY, { recursive: true })
const mapping: PlaceMapping = {}
let done = 0
let failed = 0
let rejected = 0

for (const draft of drafts.values()) {
  const { slug, seed } = draft
  let publicPath: string | undefined
  // Places mix photo sources (the sweep is Commons-only, but a curated seed may
  // pin an Unsplash or direct-URL image), so each entry records which one its
  // file came from alongside the photographer.
  let media: MediaCredit | undefined

  // 1) A curated seed's override: direct URL → Unsplash (preferred, when
  //    keyed) → explicit Commons filename. Overrides bypass the viability
  //    pass — they were hand-picked as good.
  //    (saveUnsplash* skips the API when the file already exists — rate limit.)
  if (seed?.imageUrl) {
    publicPath = await saveImageUrl(
      seed.imageUrl,
      `${PLACE_IMAGE_DIRECTORY}/${slug}`,
      `${PLACE_PUBLIC_BASE}/${slug}`,
      { width: PLACE_PHOTO_WIDTH, force }
    )
    // A hand-pinned URL names no author; keep whatever a past run captured
    // rather than crediting it to the Wikidata photo it replaced.
    if (publicPath) media = pickMediaCredit(previousMapping[slug])
  }
  if (!publicPath && seed?.unsplashPhotoId && hasUnsplashKey()) {
    const photo = await saveUnsplashPhoto(
      seed.unsplashPhotoId,
      `${PLACE_IMAGE_DIRECTORY}/${slug}`,
      `${PLACE_PUBLIC_BASE}/${slug}`,
      PLACE_PHOTO_WIDTH,
      force
    )
    if (photo) {
      const { image, ...credit } = photo
      publicPath = image
      media = credit
    }
  }
  if (!publicPath && seed?.unsplash && hasUnsplashKey()) {
    const photo = await saveUnsplashImage(
      seed.unsplash,
      `${PLACE_IMAGE_DIRECTORY}/${slug}`,
      `${PLACE_PUBLIC_BASE}/${slug}`,
      PLACE_PHOTO_WIDTH,
      force
    )
    if (photo) {
      const { image, ...credit } = photo
      publicPath = image
      media = credit
    }
  }

  // 2) Otherwise the Wikidata photo of whichever selection found this place,
  //    viability-checked. A subject on both rosters resolves ONE picture here,
  //    because it is one entry — that is what the split used to duplicate.
  if (!publicPath) {
    const photo = await savePlacePhoto({
      file: seed?.commons ?? photoFiles.get(draft.photoQid),
      slug,
      directory: PLACE_IMAGE_DIRECTORY,
      publicBase: PLACE_PUBLIC_BASE,
      previous: previousMapping[slug],
      force,
    })
    if (photo.status === 'rejected') {
      console.warn(`  rejected "${draft.name}" — source below the width floor`)
      rejected++
      continue
    }
    if (!placeHasPhoto(photo)) {
      console.warn(`  no photo for "${draft.name}"`)
      failed++
      continue
    }
    publicPath = photo.image
    media = photo.media
    if (photo.status === 'saved') await wait(250)
  }
  if (!publicPath) {
    failed++
    continue
  }

  mapping[slug] = {
    name: draft.name,
    country: draft.country,
    image: publicPath,
    ...(media ?? {}),
    ...(draft.coordinates ? { coordinates: draft.coordinates } : {}),
    ...(draft.description ? { description: draft.description } : {}),
    ...(draft.curated ? { curated: draft.curated } : {}),
    ...(draft.unesco ? { unesco: draft.unesco } : {}),
  } satisfies PlaceEntry
  done++
  process.stdout.write(`\r  ${done + failed + rejected}/${drafts.size} photos`)
}
console.log(`\nPhotos: ${done} saved, ${rejected} rejected (low-res), ${failed} failed`)

// A resurrected entry must still belong to a roster: a renamed seed shouldn't
// linger, but a heritage site the sweep merely missed this run should survive.
const seedSlugs = new Set(LANDMARK_SEEDS.map(seed => slugify(seed.name)))
const carried = carryPreviousPlaces(mapping, previousMapping, {
  stillInRoster: slug => seedSlugs.has(slug) || !!previousMapping[slug]?.unesco,
})
if (carried) console.log(`Carried ${carried} places from the previous run`)

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
  `Misplaced (dropped — wrong-country coords) (${misplacedSites.length}):`,
  ...misplacedSites.map(site => `  ${site.name} (${site.country}) ${site.qid}`),
  '',
].join('\n')
writeFileSync(join(import.meta.dirname, 'data/heritage-report.txt'), report)

writePlacesFile({
  path: 'data/places.gen.ts',
  generator: 'generators/create-places-file.ts',
  typeImport: '~~/types/places.types',
  constant: 'PLACES',
  type: 'PlaceMapping',
  mapping,
})
