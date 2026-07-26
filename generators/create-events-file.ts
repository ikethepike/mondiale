import { existsSync, writeFileSync } from 'node:fs'
import { EVENT_SEEDS, type EventKind, type EventSeed } from './data/event-seeds'
import {
  fetchImageAttribution,
  fetchImageDimensions,
  fetchJson,
  fetchPageImages,
  saveCommonsImage,
  saveImageUrl,
  wait,
} from './vendors/wikidata/commons'
import type { ISOCountryCode } from '../types/geography.types'

/**
 * Verifies each curated world event (generators/data/event-seeds) against
 * Wikidata and pulls a Commons photo for its card, for the Timeline round.
 *
 * The load-bearing check is the YEAR: an event card is worthless — worse,
 * actively harmful — if its date is wrong, so a seed only ships when one of
 * its Wikidata item's time claims (point in time, start/end, inception,
 * publication, discovery, launch, dissolution) lands within a year of the
 * curated one. The same check doubles as entity disambiguation: a name search
 * hit that is the wrong item almost never carries the right year, so
 * candidates are tried in search order until one's date agrees.
 *
 * Photos live one per event under public/events/, re-encoded to WebP, with
 * the Commons author + licence captured for the card's credit line. Merges
 * with the previous run so a transient failure never erases a captured event.
 *
 *   bun run generate:events [--force]
 */

const OUTPUT_DIRECTORY = 'public/events'
/** Event cards render at card size, never a full-screen zoom stage. */
const EVENT_WIDTH = 1400
/** Reject Wikidata-suggested images whose SOURCE is smaller than this. */
const MIN_IMAGE_WIDTH = 640
/** |seed year − claim year| a verification will accept — calendar edges. */
const YEAR_TOLERANCE = 1

/** Time-bearing properties, in the order the issue's spec trusts them. */
const TIME_PROPERTIES = ['P585', 'P580', 'P582', 'P571', 'P577', 'P575', 'P619', 'P576'] as const

export interface EventEntry {
  /** Card title, e.g. "The Berlin Wall falls". */
  name: string
  /** Anchor country for the card's flag and variant filtering. */
  country: ISOCountryCode
  kind: EventKind
  /** The year the card asserts; negative = BCE. */
  year: number
  /** One or two lines for the post-placement reveal. */
  description: string
  /** Public path of the card photo, when one was captured. */
  image?: string
  /** Commons author, for the reveal's credit line. */
  credit?: string
  /** Licence short name, e.g. "CC BY-SA 4.0". */
  license?: string
}

/** Keyed by a slug of the event's seed name. */
export type EventMapping = { [slug: string]: EventEntry }

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const force = process.argv.includes('--force')

// --- Previous run, for merging ----------------------------------------------
let previous: EventMapping = {}
try {
  const module = await import('../data/events.gen')
  previous = module.EVENTS
} catch {
  console.log('No previous events file found — starting fresh')
}

// --- Year verification ---------------------------------------------------------

/** Wikidata time → signed year ("+1989-11-09…" → 1989, "-0490-…" → -490). */
const yearOfTime = (time?: string): number | undefined => {
  if (!time) return undefined
  const match = /^([+-])(\d{1,16})-/.exec(time)
  if (!match) return undefined
  const year = Number(match[2])
  if (!Number.isFinite(year) || year === 0) return undefined
  return match[1] === '-' ? -year : year
}

interface TimeClaim {
  mainsnak?: { datavalue?: { value?: { time?: string } } }
}

interface EntitiesResponse {
  entities?: { [qid: string]: { claims?: { [property: string]: TimeClaim[] } } }
}

interface SearchResponse {
  query?: { search?: { title: string }[] }
}

/** Every year any of the item's time claims asserts, in property order. */
const claimYears = (claims: { [property: string]: TimeClaim[] } | undefined): number[] => {
  const years: number[] = []
  for (const property of TIME_PROPERTIES) {
    for (const claim of claims?.[property] ?? []) {
      const year = yearOfTime(claim.mainsnak?.datavalue?.value?.time)
      if (year !== undefined) years.push(year)
    }
  }
  return years
}

interface Verification {
  qid: string
  /** The Wikidata year that agreed with the seed. */
  matchedYear: number
}

/**
 * Resolve and verify a seed in one motion: search Wikidata by name, then take
 * the first candidate carrying a time claim within tolerance of the curated
 * year. A pinned qid skips the search but never the year check.
 */
const verifySeed = async (seed: EventSeed): Promise<Verification | { failure: string }> => {
  let candidates: string[]
  if (seed.qid) {
    candidates = [seed.qid]
  } else {
    const search = await fetchJson<SearchResponse>(
      `https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        seed.name
      )}&srnamespace=0&srlimit=5&format=json`
    )
    candidates = (search?.query?.search ?? []).map(result => result.title)
    if (!candidates.length) return { failure: 'no Wikidata search hits' }
  }

  const data = await fetchJson<EntitiesResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${candidates.join(
      '|'
    )}&props=claims&format=json`
  )

  const seenYears: number[] = []
  for (const qid of candidates) {
    for (const year of claimYears(data?.entities?.[qid]?.claims)) {
      if (Math.abs(year - seed.year) <= YEAR_TOLERANCE) return { qid, matchedYear: year }
      seenYears.push(year)
    }
  }
  return {
    failure: seenYears.length
      ? `no time claim near ${seed.year} (saw ${[...new Set(seenYears)].slice(0, 6).join(', ')})`
      : 'candidates carry no time claims at all',
  }
}

// --- Main flow -----------------------------------------------------------------

console.log(`Verifying ${EVENT_SEEDS.length} event seeds against Wikidata…`)

interface VerifiedSeed {
  seed: EventSeed
  slug: string
  qid: string
}

const verified: VerifiedSeed[] = []
const dropped: { seed: EventSeed; reason: string }[] = []

for (const seed of EVENT_SEEDS) {
  const slug = slugify(seed.name)
  const result = await verifySeed(seed)
  if ('failure' in result) {
    dropped.push({ seed, reason: result.failure })
    console.warn(`  ✗ ${seed.name} (${seed.year}): ${result.failure}`)
  } else {
    verified.push({ seed, slug, qid: result.qid })
  }
  await wait(150)
}

console.log(`Verified ${verified.length}/${EVENT_SEEDS.length}; resolving photos…`)

// Batch-resolve the representative Commons image for every verified item.
const pageImages = await fetchPageImages(verified.map(entry => entry.qid))

const mapping: EventMapping = {}
const missingImages: string[] = []

for (const { seed, slug, qid } of verified) {
  const baseName = `${OUTPUT_DIRECTORY}/${slug}`
  const publicBase = `/events/${slug}`

  let image: string | undefined
  let commonsFile: string | undefined

  if (seed.imageUrl) {
    image = await saveImageUrl(seed.imageUrl, baseName, publicBase, { width: EVENT_WIDTH, force })
  } else if (seed.commons) {
    commonsFile = seed.commons
    image = await saveCommonsImage(seed.commons, baseName, publicBase, {
      width: EVENT_WIDTH,
      force,
    })
  } else {
    const cached = force ? undefined : existsSync(`${baseName}.webp`)
    const wikidataFile = pageImages.get(qid)
    if (cached) {
      image = `${publicBase}.webp`
      commonsFile = wikidataFile
    } else if (wikidataFile) {
      const dimensions = await fetchImageDimensions(wikidataFile)
      if (dimensions && dimensions.width >= MIN_IMAGE_WIDTH) {
        commonsFile = wikidataFile
        image = await saveCommonsImage(wikidataFile, baseName, publicBase, {
          width: EVENT_WIDTH,
          force,
        })
      }
    }
  }

  let credit: string | undefined
  let license: string | undefined
  if (image && commonsFile) {
    const attribution = await fetchImageAttribution(commonsFile)
    credit = attribution?.credit
    license = attribution?.license
  }

  if (!image) missingImages.push(slug)

  mapping[slug] = {
    name: seed.title ?? seed.name,
    country: seed.country,
    kind: seed.kind,
    year: seed.year,
    description: seed.description,
    ...(image ? { image } : {}),
    ...(credit ? { credit } : {}),
    ...(license ? { license } : {}),
  }
  await wait(200)
}

// --- Merge with the previous run ---------------------------------------------
// A transient Wikidata failure must never erase an event we already hold: keep
// the old entry when the slug is still seeded and its image (if any) exists.
const currentSlugs = new Set(EVENT_SEEDS.map(seed => slugify(seed.name)))
for (const [slug, entry] of Object.entries(previous)) {
  if (mapping[slug] || !currentSlugs.has(slug)) continue
  if (entry.image && !existsSync(`public${entry.image}`)) continue
  mapping[slug] = entry
  console.log(`  kept ${slug} from the previous run`)
}

writeFileSync(
  'data/events.gen.ts',
  `// Generated by generators/create-events-file.ts — do not edit by hand.
import type { EventMapping } from '../generators/create-events-file'
export const EVENTS: EventMapping = ${JSON.stringify(mapping)}
`
)

// --- Report ---------------------------------------------------------------------
const lines: string[] = [
  `events: ${Object.keys(mapping).length} shipped of ${EVENT_SEEDS.length} seeds`,
  '',
  `dropped (${dropped.length}) — fix the year or pin a qid:`,
  ...dropped.map(({ seed, reason }) => `  ${slugify(seed.name)}\t${seed.year}\t${reason}`),
  '',
  `no image (${missingImages.length}) — add a commons/imageUrl override:`,
  ...missingImages.map(slug => `  ${slug}`),
  '',
]
writeFileSync('generators/data/events-report.txt', lines.join('\n'))

console.log(
  `Wrote data/events.gen.ts (${Object.keys(mapping).length} events, ${missingImages.length} without a photo)`
)
console.log('Full accounting in generators/data/events-report.txt')
