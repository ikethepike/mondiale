import { mkdirSync, writeFileSync } from 'node:fs'
import type { ISOCountryCode } from '../types/geography.types'
import { LANDMARK_SEEDS, type LandmarkKind } from './data/landmark-seeds'
import {
  fetchImageDimensions,
  fetchJson,
  fetchPageImages,
  resolveQidBySearch,
  saveCommonsImage,
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
const LANDMARK_WIDTH = 800

export interface LandmarkEntry {
  name: string
  country: ISOCountryCode
  kind: LandmarkKind
  image: string
  /** City / region the landmark is in (from Wikidata P131) — a hard-mode
   *  follow-up or an educational reveal after the answer. */
  city?: string
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

interface Statement {
  rank: 'preferred' | 'normal' | 'deprecated'
  mainsnak?: { datavalue?: { value?: string | { id?: string } } }
}
interface EntityResponse {
  entities?: { [id: string]: { claims?: { [property: string]: Statement[] } } }
}

const isoValue = (claims?: { [property: string]: Statement[] }): string | undefined => {
  const value = claims?.P297?.find(statement => statement.rank !== 'deprecated')?.mainsnak?.datavalue
    ?.value
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
  const qid = await resolveQidBySearch(seed.name, {
    contextCountryQid: isoToQid.get(seed.country),
  })
  if (qid) resolved.push({ seed, qid })
  else console.warn(`  no Q-id for "${seed.name}" (${seed.country})`)
  await wait(150)
}

// --- 3. City / location (P131) → label --------------------------------------
console.log('Reading landmark locations (P131)…')
const locationQidOf = new Map<string, string>() // landmark qid → location qid
const locationLabelQids = new Set<string>()
const landmarkQids = resolved.map(entry => entry.qid)
for (let index = 0; index < landmarkQids.length; index += 30) {
  const batch = landmarkQids.slice(index, index + 30)
  const data = await fetchJson<EntityResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=claims&format=json`
  )
  for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
    const value = entity.claims?.P131?.find(
      statement => statement.rank !== 'deprecated' && typeof statement.mainsnak?.datavalue?.value === 'object'
    )?.mainsnak?.datavalue?.value
    const locationQid = typeof value === 'object' ? value.id : undefined
    if (locationQid) {
      locationQidOf.set(qid, locationQid)
      locationLabelQids.add(locationQid)
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

// --- 4. Photos (viability-checked) + assemble --------------------------------
const photoFiles = await fetchPageImages(resolved.map(entry => entry.qid))

mkdirSync(OUTPUT_DIRECTORY, { recursive: true })
const mapping: LandmarkMapping = {}
let done = 0
let failed = 0
let rejected = 0

for (const { seed, qid } of resolved) {
  const slug = slugify(seed.name)
  let publicPath: string | undefined

  // 1) Override: Unsplash (preferred, when keyed) → explicit Commons filename.
  //    Overrides bypass the viability pass — they were hand-picked as good.
  //    (saveUnsplash* skips the API when the file already exists — rate limit.)
  if (seed.unsplashPhotoId && hasUnsplashKey()) {
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
    publicPath = await saveCommonsImage(
      file,
      `${OUTPUT_DIRECTORY}/${slug}`,
      `/landmarks/${slug}`,
      { width: LANDMARK_WIDTH, force }
    )
  }

  if (!publicPath) {
    failed++
    continue
  }

  const locationQid = locationQidOf.get(qid)
  const city = locationQid ? locationLabels.get(locationQid) : undefined
  mapping[slug] = {
    name: seed.name,
    country: seed.country,
    kind: seed.kind,
    image: publicPath,
    ...(city ? { city } : {}),
  }
  done++
  process.stdout.write(`\r  ${done + failed + rejected}/${resolved.length} photos`)
  await wait(250)
}
console.log(`\nPhotos: ${done} saved, ${rejected} rejected (low-res), ${failed} failed`)

// Merge with the previous run — but only for slugs that are STILL current
// seeds, so a renamed/removed landmark (Big Ben → Elizabeth Tower) doesn't
// linger with its stale image.
const currentSlugs = new Set(LANDMARK_SEEDS.map(seed => slugify(seed.name)))
for (const [slug, entry] of Object.entries(previousMapping)) {
  if (!mapping[slug] && currentSlugs.has(slug)) mapping[slug] = entry
}

writeFileSync(
  'data/landmarks.gen.ts',
  `
      import type { LandmarkMapping } from '../generators/create-landmarks-file'
      export const LANDMARKS: LandmarkMapping = ${JSON.stringify(mapping)}
    `
)
console.log(`Wrote data/landmarks.gen.ts (${Object.keys(mapping).length} landmarks)`)
