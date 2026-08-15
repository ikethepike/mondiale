import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { pickMediaCredit, type MediaCredit } from '../lib/attribution'
import type { LandmarkEntry, LandmarkMapping } from '../types/places.types'
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
  placeHasPhoto,
  placeSitsInCountry,
  PLACE_PHOTO_WIDTH,
  savePlacePhoto,
  slugify,
  wait,
  writePlacesFile,
  type EntityResponse,
} from './vendors/wikidata/places'

/**
 * Pulls a photo for each curated world landmark (generators/data/landmark-seeds)
 * from Wikimedia Commons, for the Landmark Quiz "which country is this landmark
 * in?" gate and the pin-the-landmark round. Each seed's Wikidata Q-id is
 * resolved by name, disambiguated by P17 (country) against the seed's ISO so we
 * never grab a same-named item in the wrong country. The P18-derived Commons
 * image is then downloaded through the shared place pipeline in
 * vendors/wikidata/places.ts, which the heritage sweep rides too.
 *
 * The seed file lists each country's icon first; that deliberate ordering is
 * stamped onto every entry as an explicit `fame` tier, so the difficulty gate
 * no longer depends on array order surviving every merge.
 *
 * Photos live one per landmark under public/landmarks/. Merges with the
 * previous run so a transient failure never erases a captured landmark.
 *
 *   bun run generate:landmarks [--force]
 */

const OUTPUT_DIRECTORY = 'public/landmarks'
const PUBLIC_BASE = '/landmarks'

const force = process.argv.includes('--force')

let previousMapping: LandmarkMapping = {}
try {
  previousMapping = (await import('../data/landmarks.gen')).LANDMARKS ?? {}
} catch {
  // First run — nothing to merge
}

// --- 1. Build an ISO → country Q-id map (for P17 disambiguation) -------------
console.log('Mapping ISO codes to country Q-ids…')
const { isoToQid } = await fetchCountryQidMap()
console.log(`  ${isoToQid.size} countries mapped`)

// --- 2. Resolve each landmark's Q-id (country-disambiguated) ----------------
console.log(`Resolving ${LANDMARK_SEEDS.length} landmark Q-ids…`)
const seedHasImageOverride = (seed: (typeof LANDMARK_SEEDS)[number]) =>
  !!(seed.imageUrl || seed.unsplashPhotoId || seed.unsplash || seed.commons)

const resolved: { seed: (typeof LANDMARK_SEEDS)[number]; qid: string }[] = []
for (const seed of LANDMARK_SEEDS) {
  // A pinned qid is the answer; searching for it could only get it wrong.
  const qid =
    seed.qid ??
    (await resolveQidBySearch(seed.name, {
      contextCountryQid: isoToQid.get(seed.country),
    }))
  // The Q-id only supplies the fallback photo and the P131 city label, so an
  // overridden seed still belongs in the run even when its name doesn't
  // resolve — it just loses the `city` field.
  if (qid) resolved.push({ seed, qid })
  else if (seedHasImageOverride(seed)) resolved.push({ seed, qid: '' })
  else console.warn(`  no Q-id for "${seed.name}" (${seed.country})`)
  await wait(150)
}

// --- 3. City (P131) + coordinates (P625), from one claims fetch --------------
console.log('Reading landmark locations (P131) and coordinates (P625)…')
const locationQidOf = new Map<string, string>() // landmark qid → location qid
const locationLabelQids = new Set<string>()
const coordinateOf = new Map<string, { lat: number; lng: number }>()
// Overridden seeds may carry an empty qid — never send those to the API.
const landmarkQids = resolved.map(entry => entry.qid).filter(Boolean)
for (let index = 0; index < landmarkQids.length; index += 30) {
  const batch = landmarkQids.slice(index, index + 30)
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

// --- 4. Validate coordinates against the seed's country ----------------------
console.log('Validating coordinates against country polygons…')
const shapes = await loadCountryShapes()
let misplaced = 0

for (const entry of resolved) {
  const { seed, qid } = entry
  const point = coordinateOf.get(qid)
  if (!point) continue
  const verdict = placeSitsInCountry(shapes, seed.country, point)
  if (verdict.inside) continue

  // Too far out to be coastline slop: resolveQidBySearch matched the wrong
  // item. That Q-id also supplies the photo and the city, so disown it whole
  // rather than keep a landmark illustrated with another country's picture.
  // Blanking the qid leaves the seed alive only if it has an image override —
  // otherwise it's dropped, which is the right outcome for a bad match.
  console.warn(
    `  ✗ "${seed.name}" (${seed.country}) sits ${Math.round(verdict.kmOutside)}km outside its country — wrong Wikidata item (${qid})`
  )
  coordinateOf.delete(qid)
  locationQidOf.delete(qid)
  entry.qid = ''
  misplaced++

  // An image already downloaded from the bad Q-id is another country's photo
  // (Ecuador was shipping Shibam, Yemen). Existing files short-circuit the
  // download, so it would survive forever — delete it. A seed with an explicit
  // override owns its image and is left alone.
  if (seedHasImageOverride(seed)) continue
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
const photoFiles = await fetchPageImages(resolved.map(entry => entry.qid).filter(Boolean))

// The seed file lists each country's icon first, and that order is the fame
// signal — stamped here so nothing downstream has to preserve array order.
const famed = assignFameByCountry(
  resolved.map(({ seed, qid }) => ({ ...seed, qid, country: seed.country }))
)

mkdirSync(OUTPUT_DIRECTORY, { recursive: true })
const mapping: LandmarkMapping = {}
let done = 0
let failed = 0
let rejected = 0

for (const seed of famed) {
  const { qid } = seed
  const slug = slugify(seed.name)
  let publicPath: string | undefined
  // Landmarks are the one dataset that mixes photo sources, so each entry
  // records which one its file came from alongside the photographer.
  let media: MediaCredit | undefined

  // 1) Override: direct URL → Unsplash (preferred, when keyed) → explicit
  //    Commons filename. Overrides bypass the viability pass — they were
  //    hand-picked as good.
  //    (saveUnsplash* skips the API when the file already exists — rate limit.)
  if (seed.imageUrl) {
    publicPath = await saveImageUrl(
      seed.imageUrl,
      `${OUTPUT_DIRECTORY}/${slug}`,
      `${PUBLIC_BASE}/${slug}`,
      {
        width: PLACE_PHOTO_WIDTH,
        force,
      }
    )
    // A hand-pinned URL names no author; keep whatever a past run captured
    // rather than crediting it to the Wikidata photo it replaced.
    if (publicPath) media = pickMediaCredit(previousMapping[slug])
  }
  if (!publicPath && seed.unsplashPhotoId && hasUnsplashKey()) {
    const photo = await saveUnsplashPhoto(
      seed.unsplashPhotoId,
      `${OUTPUT_DIRECTORY}/${slug}`,
      `${PUBLIC_BASE}/${slug}`,
      PLACE_PHOTO_WIDTH,
      force
    )
    if (photo) {
      const { image, ...credit } = photo
      publicPath = image
      media = credit
    }
  }
  if (!publicPath && seed.unsplash && hasUnsplashKey()) {
    const photo = await saveUnsplashImage(
      seed.unsplash,
      `${OUTPUT_DIRECTORY}/${slug}`,
      `${PUBLIC_BASE}/${slug}`,
      PLACE_PHOTO_WIDTH,
      force
    )
    if (photo) {
      const { image, ...credit } = photo
      publicPath = image
      media = credit
    }
  }
  if (!publicPath && seed.commons) {
    const photo = await savePlacePhoto({
      file: seed.commons,
      slug,
      directory: OUTPUT_DIRECTORY,
      publicBase: PUBLIC_BASE,
      previous: previousMapping[slug],
      force,
    })
    if (placeHasPhoto(photo)) {
      publicPath = photo.image
      media = photo.media
    }
  }

  // 2) Otherwise the Wikidata default photo, viability-checked.
  if (!publicPath) {
    const photo = await savePlacePhoto({
      file: photoFiles.get(qid),
      slug,
      directory: OUTPUT_DIRECTORY,
      publicBase: PUBLIC_BASE,
      previous: previousMapping[slug],
      force,
    })
    if (photo.status === 'rejected') {
      console.warn(`  rejected "${seed.name}" — source below the width floor`)
      rejected++
      continue
    }
    if (!placeHasPhoto(photo)) {
      console.warn(`  no photo for "${seed.name}"`)
      failed++
      continue
    }
    publicPath = photo.image
    media = photo.media
  }
  if (!publicPath) {
    failed++
    continue
  }

  const locationQid = locationQidOf.get(qid)
  const city = locationQid ? locationLabels.get(locationQid) : undefined
  const coordinates = coordinateOf.get(qid)
  const description = LANDMARK_FACTS[slug]

  mapping[slug] = {
    name: seed.name,
    country: seed.country,
    kind: seed.kind,
    image: publicPath,
    fame: seed.fame,
    ...(media ?? {}),
    ...(city ? { city } : {}),
    ...(coordinates ? { coordinates } : {}),
    ...(description ? { description } : {}),
  }
  done++
  process.stdout.write(`\r  ${done + failed + rejected}/${resolved.length} photos`)
  await wait(250)
}
console.log(`\nPhotos: ${done} saved, ${rejected} rejected (low-res), ${failed} failed`)

// A resurrected entry must still be a seed — a renamed landmark shouldn't linger.
const currentSlugs = new Set(LANDMARK_SEEDS.map(seed => slugify(seed.name)))
carryPreviousPlaces<LandmarkEntry>(mapping, previousMapping, {
  stillInRoster: slug => currentSlugs.has(slug),
})

writePlacesFile({
  path: 'data/landmarks.gen.ts',
  generator: 'generators/create-landmarks-file.ts',
  typeImport: '~~/types/places.types',
  constant: 'LANDMARKS',
  type: 'LandmarkMapping',
  mapping,
})
