import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import type { ISOCountryCode } from '../types/geography.types'
import { LANDMARK_SEEDS, type LandmarkKind } from './data/landmark-seeds'
import { loadCountryShapes } from './vendors/naturalearth/country-shapes'
import {
  existingImagePath,
  fetchImageDimensions,
  fetchJson,
  fetchPageImages,
  resolveQidBySearch,
  saveCommonsImage,
  saveImageUrl,
  wait,
} from './vendors/wikidata/commons'
import { hasUnsplashKey, saveUnsplashImage, saveUnsplashPhoto } from './vendors/unsplash/unsplash'

/**
 * Pulls a photo for each curated world landmark (generators/data/landmark-seeds)
 * from Wikimedia Commons, for the Landmark Quiz "which country is this landmark
 * in?" gate. Each seed's Wikidata Q-id is resolved by name, disambiguated by
 * P17 (country) against the seed's ISO so we never grab a same-named item in
 * the wrong country. The P18-derived Commons image is then downloaded.
 *
 * Photos live one per landmark under public/landmarks/. Merges with the
 * previous run so a transient failure never erases a captured landmark.
 *
 *   bun run generate:landmarks [--force]
 */

const OUTPUT_DIRECTORY = 'public/landmarks'
/** Landmarks render in ZoomableImage (MAX_SCALE 5), so they need real pixels.
 *  A source smaller than this is used as-is, never upscaled. */
const LANDMARK_WIDTH = 2000

/** Where a landmark actually is, in degrees (Wikidata P625). */
export interface LandmarkCoordinates {
  lat: number
  lng: number
}

export interface LandmarkEntry {
  name: string
  country: ISOCountryCode
  kind: LandmarkKind
  image: string
  /** City / region the landmark is in (from Wikidata P131) — a hard-mode
   *  follow-up or an educational reveal after the answer. */
  city?: string
  /** Point location (P625), validated to fall in `country`. Powers the
   *  pin-the-landmark round: the distance between a map click and this. */
  coordinates?: LandmarkCoordinates
}

/** Reject images whose SOURCE is smaller than this — they look bad upscaled. */
const MIN_IMAGE_WIDTH = 900
/** Keyed by a slug of the landmark name. */
export type LandmarkMapping = { [slug: string]: LandmarkEntry }

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const force = process.argv.includes('--force')

let previousMapping: LandmarkMapping = {}
try {
  previousMapping = (await import('../data/landmarks.gen')).LANDMARKS ?? {}
} catch {
  // First run — nothing to merge
}

/** Wikidata's `globecoordinate` datavalue (P625). */
interface GlobeCoordinate {
  latitude: number
  longitude: number
  precision?: number
}

interface Statement {
  rank: 'preferred' | 'normal' | 'deprecated'
  mainsnak?: { datavalue?: { value?: string | { id?: string } | GlobeCoordinate } }
}
interface EntityResponse {
  entities?: { [id: string]: { claims?: { [property: string]: Statement[] } } }
}

type StatementValue = string | { id?: string } | GlobeCoordinate | undefined

const isGlobeCoordinate = (value: StatementValue): value is GlobeCoordinate =>
  typeof value === 'object' && value !== null && 'latitude' in value

/** An `wikibase-entityid` datavalue — a reference to another Q-item. */
const entityId = (value: StatementValue): string | undefined =>
  typeof value === 'object' && value !== null && 'id' in value ? value.id : undefined

const isoValue = (claims?: { [property: string]: Statement[] }): string | undefined => {
  const value = claims?.P297?.find(statement => statement.rank !== 'deprecated')?.mainsnak
    ?.datavalue?.value
  return typeof value === 'string' ? value : undefined
}

// --- 1. Build an ISO → country Q-id map (for P17 disambiguation) -------------
interface SearchResponse {
  query?: { search?: { title: string }[] }
  continue?: { sroffset: number }
}
console.log('Mapping ISO codes to country Q-ids…')
const countryEntityIds: string[] = []
let offset: number | undefined = 0
while (offset !== undefined) {
  const page: SearchResponse | undefined = await fetchJson<SearchResponse>(
    `https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      'haswbstatement:P297'
    )}&srnamespace=0&srlimit=50&sroffset=${offset}&format=json`
  )
  countryEntityIds.push(...(page?.query?.search ?? []).map(hit => hit.title))
  offset = page?.continue?.sroffset
  await wait(200)
}

const isoToQid = new Map<ISOCountryCode, string>()
for (let index = 0; index < countryEntityIds.length; index += 20) {
  const batch = countryEntityIds.slice(index, index + 20)
  const data = await fetchJson<EntityResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=claims&format=json`
  )
  for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
    const iso = isoValue(entity.claims)
    if (iso && !isoToQid.has(iso as ISOCountryCode)) isoToQid.set(iso as ISOCountryCode, qid)
  }
  await wait(200)
}
console.log(`  ${isoToQid.size} countries mapped`)

// --- 2. Resolve each landmark's Q-id (country-disambiguated) ----------------
console.log(`Resolving ${LANDMARK_SEEDS.length} landmark Q-ids…`)
const resolved: { seed: (typeof LANDMARK_SEEDS)[number]; qid: string }[] = []
for (const seed of LANDMARK_SEEDS) {
  const hasOverride = !!(seed.imageUrl || seed.unsplashPhotoId || seed.unsplash || seed.commons)
  const qid = await resolveQidBySearch(seed.name, {
    contextCountryQid: isoToQid.get(seed.country),
  })
  // The Q-id only supplies the fallback photo and the P131 city label, so an
  // overridden seed still belongs in the run even when its name doesn't
  // resolve — it just loses the `city` field.
  if (qid) resolved.push({ seed, qid })
  else if (hasOverride) resolved.push({ seed, qid: '' })
  else console.warn(`  no Q-id for "${seed.name}" (${seed.country})`)
  await wait(150)
}

// --- 3. City (P131) + coordinates (P625), from one claims fetch --------------
console.log('Reading landmark locations (P131) and coordinates (P625)…')
const locationQidOf = new Map<string, string>() // landmark qid → location qid
const locationLabelQids = new Set<string>()
const coordinateOf = new Map<string, LandmarkCoordinates>()
// Overridden seeds may carry an empty qid — never send those to the API.
const landmarkQids = resolved.map(entry => entry.qid).filter(Boolean)
for (let index = 0; index < landmarkQids.length; index += 30) {
  const batch = landmarkQids.slice(index, index + 30)
  const data = await fetchJson<EntityResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=claims&format=json`
  )
  for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
    const value = entity.claims?.P131?.find(
      statement =>
        statement.rank !== 'deprecated' && typeof statement.mainsnak?.datavalue?.value === 'object'
    )?.mainsnak?.datavalue?.value
    const locationQid = entityId(value)
    if (locationQid) {
      locationQidOf.set(qid, locationQid)
      locationLabelQids.add(locationQid)
    }

    // P625 rides along in this same response — free.
    const point = entity.claims?.P625?.find(statement => statement.rank !== 'deprecated')?.mainsnak
      ?.datavalue?.value
    if (isGlobeCoordinate(point)) {
      coordinateOf.set(qid, { lat: point.latitude, lng: point.longitude })
    }
  }
  await wait(200)
}

interface LabelResponse {
  entities?: { [id: string]: { labels?: { en?: { value: string } } } }
}
const locationLabels = new Map<string, string>()
const locationQidList = [...locationLabelQids]
for (let index = 0; index < locationQidList.length; index += 50) {
  const batch = locationQidList.slice(index, index + 50)
  const data = await fetchJson<LabelResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=labels&languages=en&languagefallback=1&format=json`
  )
  for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
    if (entity.labels?.en?.value) locationLabels.set(qid, entity.labels.en.value)
  }
  await wait(200)
}

// --- 4. Validate coordinates against the seed's country ----------------------
/**
 * How far outside its country a landmark's point may sit before we disown it.
 *
 * `resolveQidBySearch` falls back to the first search hit when nothing matches
 * the seed's country (P17), so a name that doesn't exist on Wikidata resolves
 * to something else entirely — "Persepolis" lands on Persepolis F.C., the
 * football club. Coordinates catch that: the wrong entity is almost always in
 * the wrong hemisphere.
 *
 * The threshold is set from the real distribution. Genuine landmarks sit at
 * most ~36km outside their country's 10m polygon (islands, coastlines, and
 * points like the Statue of Liberty or Everest on a shared border). The
 * confirmed wrong-entity hits were 4,300km and 13,600km out. Nothing real
 * falls between, so 100km is a wide, unambiguous line.
 */
const MAX_KM_OUTSIDE_COUNTRY = 100

console.log('Validating coordinates against country polygons…')
const shapes = await loadCountryShapes()
let misplaced = 0

for (const entry of resolved) {
  const { seed, qid } = entry
  const point = coordinateOf.get(qid)
  if (!point || !shapes.has(seed.country)) continue
  if (shapes.contains(seed.country, point.lat, point.lng)) continue

  const km = shapes.distanceToBorderKm(seed.country, point.lat, point.lng)
  if (km <= MAX_KM_OUTSIDE_COUNTRY) continue

  // Too far out to be coastline slop: resolveQidBySearch matched the wrong
  // item. That Q-id also supplies the photo and the city, so disown it whole
  // rather than keep a landmark illustrated with another country's picture.
  // Blanking the qid leaves the seed alive only if it has an image override —
  // otherwise it's dropped, which is the right outcome for a bad match.
  console.warn(
    `  ✗ "${seed.name}" (${seed.country}) sits ${Math.round(km)}km outside its country — wrong Wikidata item (${qid})`
  )
  coordinateOf.delete(qid)
  locationQidOf.delete(qid)
  entry.qid = ''
  misplaced++

  // An image already downloaded from the bad Q-id is another country's photo
  // (Ecuador was shipping Shibam, Yemen). Existing files short-circuit the
  // download, so it would survive forever — delete it. A seed with an explicit
  // override owns its image and is left alone.
  const overridden = !!(seed.imageUrl || seed.unsplashPhotoId || seed.unsplash || seed.commons)
  if (overridden) continue
  const stalePath = `${OUTPUT_DIRECTORY}/${slugify(seed.name)}.webp`
  if (existsSync(stalePath)) {
    rmSync(stalePath, { force: true })
    console.warn(`    removed its cached image — add an image override to keep this landmark`)
  }
}
console.log(`  ${coordinateOf.size} coordinates kept, ${misplaced} wrong-item matches disowned`)

// --- 5. Photos (viability-checked) + assemble --------------------------------
// Recomputed: the validation pass above blanks the qid of any wrong-item match,
// so those must not have a photo fetched for them.
const photoQids = resolved.map(entry => entry.qid).filter(Boolean)
const photoFiles = await fetchPageImages(photoQids)

mkdirSync(OUTPUT_DIRECTORY, { recursive: true })
const mapping: LandmarkMapping = {}
let done = 0
let failed = 0
let rejected = 0

for (const { seed, qid } of resolved) {
  const slug = slugify(seed.name)
  let publicPath: string | undefined

  // 1) Override: direct URL → Unsplash (preferred, when keyed) → explicit
  //    Commons filename. Overrides bypass the viability pass — they were
  //    hand-picked as good.
  //    (saveUnsplash* skips the API when the file already exists — rate limit.)
  if (seed.imageUrl) {
    publicPath = await saveImageUrl(
      seed.imageUrl,
      `${OUTPUT_DIRECTORY}/${slug}`,
      `/landmarks/${slug}`,
      { width: LANDMARK_WIDTH, force }
    )
  }
  if (!publicPath && seed.unsplashPhotoId && hasUnsplashKey()) {
    publicPath = await saveUnsplashPhoto(
      seed.unsplashPhotoId,
      `${OUTPUT_DIRECTORY}/${slug}`,
      `/landmarks/${slug}`,
      LANDMARK_WIDTH,
      force
    )
  }
  if (!publicPath && seed.unsplash && hasUnsplashKey()) {
    publicPath = await saveUnsplashImage(
      seed.unsplash,
      `${OUTPUT_DIRECTORY}/${slug}`,
      `/landmarks/${slug}`,
      LANDMARK_WIDTH,
      force
    )
  }
  if (!publicPath && seed.commons) {
    publicPath = await saveCommonsImage(
      seed.commons,
      `${OUTPUT_DIRECTORY}/${slug}`,
      `/landmarks/${slug}`,
      { width: LANDMARK_WIDTH, force }
    )
  }

  // 2) Otherwise the Wikidata default photo, viability-checked.
  if (!publicPath) {
    // Already on disk? Then skip the width lookup — it costs a Commons API call
    // per landmark and only gates a download we're not going to make.
    publicPath = force
      ? undefined
      : existingImagePath(`${OUTPUT_DIRECTORY}/${slug}`, `/landmarks/${slug}`)
  }
  if (!publicPath) {
    const file = photoFiles.get(qid)
    if (!file) {
      console.warn(`  no photo for "${seed.name}"`)
      failed++
      continue
    }
    // Reject a low-resolution source — it looks bad upscaled in a photo quiz.
    const dimensions = await fetchImageDimensions(file)
    if (dimensions && dimensions.width < MIN_IMAGE_WIDTH) {
      console.warn(`  rejected "${seed.name}" — source only ${dimensions.width}px wide`)
      rejected++
      await wait(120)
      continue
    }
    publicPath = await saveCommonsImage(file, `${OUTPUT_DIRECTORY}/${slug}`, `/landmarks/${slug}`, {
      width: LANDMARK_WIDTH,
      force,
    })
  }

  if (!publicPath) {
    failed++
    continue
  }

  const locationQid = locationQidOf.get(qid)
  const city = locationQid ? locationLabels.get(locationQid) : undefined
  const coordinates = coordinateOf.get(qid)
  mapping[slug] = {
    name: seed.name,
    country: seed.country,
    kind: seed.kind,
    image: publicPath,
    ...(city ? { city } : {}),
    ...(coordinates ? { coordinates } : {}),
  }
  done++
  process.stdout.write(`\r  ${done + failed + rejected}/${resolved.length} photos`)
  await wait(250)
}
console.log(`\nPhotos: ${done} saved, ${rejected} rejected (low-res), ${failed} failed`)

// Merge with the previous run so a transient network failure doesn't erase a
// captured landmark. Two guards: the slug must still be a seed (a renamed
// landmark shouldn't linger), and its image must still be on disk — the
// coordinate check above deletes the photo of a wrong-item match, and
// resurrecting that entry would point the game at a file we just removed.
const currentSlugs = new Set(LANDMARK_SEEDS.map(seed => slugify(seed.name)))
for (const [slug, entry] of Object.entries(previousMapping)) {
  if (mapping[slug] || !currentSlugs.has(slug)) continue
  if (!existsSync(`public${entry.image}`)) {
    console.warn(`  dropping "${entry.name}" — its image is gone`)
    continue
  }
  mapping[slug] = entry
}

writeFileSync(
  'data/landmarks.gen.ts',
  `
      import type { LandmarkMapping } from '../generators/create-landmarks-file'
      export const LANDMARKS: LandmarkMapping = ${JSON.stringify(mapping)}
    `
)
console.log(`Wrote data/landmarks.gen.ts (${Object.keys(mapping).length} landmarks)`)
