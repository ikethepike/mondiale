import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { CHANGE_SEEDS, type ChangeKind, type ChangeSeed } from './data/change-seeds'
import { loadCountryShapes } from './vendors/naturalearth/country-shapes'
import { saveImageUrl, wait } from './vendors/wikidata/commons'
import { COUNTRIES } from '../data/countries.gen'
import { ISOCountryCodes } from '../data/iso-codes.gen'
import type { MediaCredit } from '../lib/attribution'
import { mentionsCountry } from '../lib/country'
import type { ISOCountryCode, Region } from '../types/geography.types'

/**
 * Downloads the matched satellite pairs behind World of Change
 * (generators/data/change-seeds) into public/changes, for the final-challenge
 * item where two frames decades apart crossfade and the player taps where.
 *
 * Two gates decide whether a seed ships, both of them about the round being
 * answerable at all:
 *
 * 1. ON LAND — the subject must fall inside one of its accepted countries'
 *    polygons. The map dispatches a click only from a country path, so a
 *    subject sitting offshore is a question with no reachable answer.
 * 2. NO COUNTRY LEAK — neither the slug (which names the image file, visible
 *    in devtools), the title, nor the description may name an accepted
 *    country, its capital or its demonyms.
 *
 * Both frames must land or the seed does not ship: one frame is not a
 * crossfade. Merges with the previous run so a transient fetch failure never
 * erases a story already on disk.
 *
 *   bun run generate:changes [--force]
 */

const OUTPUT_DIRECTORY = 'public/changes'
/**
 * The events/heritage width. Both frames must register pixel-to-pixel for the
 * crossfade to read as change rather than as a cut, and writeWebp is
 * downscale-only to a fixed width — so a matched source pair stays matched.
 * 1400 gives 2x headroom over the ~700 CSS px the stage renders at.
 */
const CHANGE_WIDTH = 1400
/** Every region must carry at least this many stories — the Anthropocene is
 *  not a story about one continent. */
const MIN_STORIES_PER_REGION = 1
/**
 * No region may carry more than this share of the deck. A third rather than a
 * quarter because the source series is itself American-weighted — NASA shot
 * more of its own country — so a quarter would cap the whole deck at four
 * times however many non-US stories exist, and the answer to a lopsided source
 * is to keep hunting the rest of the world, not to ship six stories. The
 * dealer weights by region on top of this, so a region at the ceiling still
 * deals less often per story than a thin one.
 *
 * The share only binds once the deck is big enough for it to mean anything —
 * under this many seeds a single story can breach a third on its own.
 */
const MAX_REGION_SHARE = 1 / 3
const REGION_SHARE_APPLIES_FROM = 12

export interface ChangeFrame {
  /** Public path of the committed WebP. */
  image: string
  year: number
}

export interface ChangeEntry extends MediaCredit {
  /** Recognisable name — reveal only; the slug stays geographically mute. */
  name: string
  /** Every country whose tap the verdict accepts. */
  countries: ISOCountryCode[]
  kind: ChangeKind
  coordinates: { lat: number; lng: number }
  /** The decade dial's answer lives here — never on the snapshot. */
  startYear: number
  description: string
  /** Earlier frame first; the stage crossfades between exactly two. */
  frames: [ChangeFrame, ChangeFrame]
}

/** Keyed by a slug of the seed's (country-mute) name. */
export type ChangeMapping = { [slug: string]: ChangeEntry }

/** NASA imagery is US-Government public domain; EO republishes it under the
 *  observatory's own line. Per-frame credits would be the same string twice,
 *  so the credit stays entry-level like every other media dataset. */
const NASA_EO_CREDIT: MediaCredit = {
  credit: 'NASA Earth Observatory',
  license: 'Public domain',
  imageSource: 'nasa-earth-observatory',
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const force = process.argv.includes('--force')

// Bun runs this file without typechecking, so the ISOCountryCode annotation on
// ChangeSeed.countries proves nothing at runtime. A code outside the playable
// set crashes COUNTRIES lookups up in round staging (frozen room), so refuse
// to generate at all.
const unplayable = CHANGE_SEEDS.flatMap(seed =>
  seed.countries
    .filter(code => !(ISOCountryCodes as readonly string[]).includes(code))
    .map(code => `${seed.name} (${code})`)
)
if (unplayable.length) {
  throw new Error(`Change seeds accepting non-playable country codes: ${unplayable.join(', ')}`)
}

const duplicates = CHANGE_SEEDS.map(seed => slugify(seed.name)).filter(
  (slug, index, all) => all.indexOf(slug) !== index
)
if (duplicates.length) {
  throw new Error(`Change seeds sharing a slug: ${[...new Set(duplicates)].join(', ')}`)
}

// --- Gate 1: the subject must lie on land, inside an accepted country --------
const shapes = await loadCountryShapes()
const offshore = CHANGE_SEEDS.filter(seed => {
  const { lat, lng } = seed.coordinates
  return !seed.countries.some(code => shapes.has(code) && shapes.contains(code, lat, lng))
})
if (offshore.length) {
  throw new Error(
    `Change seeds whose subject falls outside every accepted country (the map dispatches no click on water): ${offshore
      .map(seed => `${seed.name} [${seed.countries.join(', ')}]`)
      .join(', ')}`
  )
}

// --- Gate 2: nothing may name the answer ------------------------------------
// The slug names the image file, so it is scrubbed alongside the prose through
// the shared giveaway check — the same one the leader hints use.
const leaks = CHANGE_SEEDS.flatMap(seed =>
  seed.countries
    .filter(code => mentionsCountry(`${seed.name} ${seed.title ?? ''} ${seed.description}`, code))
    .map(code => `${seed.name} → ${code}`)
)
if (leaks.length) {
  throw new Error(`Change seeds naming their own answer: ${leaks.join(', ')}`)
}

// --- Region quota -----------------------------------------------------------
const regionOf = (seed: ChangeSeed): Region | undefined => COUNTRIES[seed.countries[0]]?.region
const byRegion = new Map<Region, number>()
for (const seed of CHANGE_SEEDS) {
  const region = regionOf(seed)
  if (region) byRegion.set(region, (byRegion.get(region) ?? 0) + 1)
}
const thin = [...byRegion.entries()].filter(([, count]) => count < MIN_STORIES_PER_REGION)
const heavy =
  CHANGE_SEEDS.length < REGION_SHARE_APPLIES_FROM
    ? []
    : [...byRegion.entries()].filter(([, count]) => count / CHANGE_SEEDS.length > MAX_REGION_SHARE)
if (heavy.length) {
  throw new Error(
    `Change seeds over-weight a region (max ${MAX_REGION_SHARE * 100}%): ${heavy
      .map(([region, count]) => `${region} ${count}/${CHANGE_SEEDS.length}`)
      .join(', ')}`
  )
}

// --- Previous run, for merging ----------------------------------------------
let previous: ChangeMapping = {}
try {
  const module = await import('../data/changes.gen')
  previous = module.CHANGES
} catch {
  console.log('No previous changes file found — starting fresh')
}

mkdirSync(OUTPUT_DIRECTORY, { recursive: true })

const mapping: ChangeMapping = {}
const dropped: { slug: string; reason: string }[] = []

for (const seed of CHANGE_SEEDS) {
  const slug = slugify(seed.name)
  const frames: ChangeFrame[] = []

  for (const [url, year, suffix] of [
    [seed.beforeUrl, seed.beforeYear, 'before'],
    [seed.afterUrl, seed.afterYear, 'after'],
  ] as const) {
    // A dropped socket mid-run must cost one frame, not the whole deck: the
    // merge below keeps whatever a previous run already captured.
    const image = await saveImageUrl(
      url,
      `${OUTPUT_DIRECTORY}/${slug}-${suffix}`,
      `/changes/${slug}-${suffix}`,
      {
        width: CHANGE_WIDTH,
        force,
      }
    ).catch(error => {
      console.log(`  ${slug}-${suffix} failed: ${error}`)
      return undefined
    })
    if (image) frames.push({ image, year })
    // The archive throttles far harder than Commons does; a cached frame
    // short-circuits above, so this only paces genuinely new downloads.
    await wait(3000)
  }

  // One frame is not a crossfade — a half-downloaded story never ships.
  if (frames.length !== 2) {
    dropped.push({ slug, reason: `only ${frames.length}/2 frames downloaded` })
    continue
  }

  mapping[slug] = {
    name: seed.title ?? seed.name,
    countries: seed.countries,
    kind: seed.kind,
    coordinates: seed.coordinates,
    startYear: seed.startYear,
    description: seed.description,
    frames: [frames[0], frames[1]],
    ...NASA_EO_CREDIT,
    ...(seed.credit ? { credit: seed.credit } : {}),
  }
}

// --- Merge with the previous run --------------------------------------------
// A transient fetch failure must never erase a story we already hold: keep the
// old entry when the slug is still seeded and BOTH its frames exist on disk.
const currentSlugs = new Set(CHANGE_SEEDS.map(seed => slugify(seed.name)))
for (const [slug, entry] of Object.entries(previous)) {
  if (mapping[slug] || !currentSlugs.has(slug)) continue
  if (!entry.frames.every(frame => existsSync(`public${frame.image}`))) continue
  mapping[slug] = entry
  console.log(`  kept ${slug} from the previous run`)
}

writeFileSync(
  'data/changes.gen.ts',
  `// Generated by generators/create-change-file.ts — do not edit by hand.
import type { ChangeMapping } from '../generators/create-change-file'
export const CHANGES: ChangeMapping = ${JSON.stringify(mapping)}
`
)

// --- Report -----------------------------------------------------------------
const shipped = Object.values(mapping)
const bytes = shipped
  .flatMap(entry => entry.frames)
  .reduce(
    (total, frame) =>
      total + (existsSync(`public${frame.image}`) ? statSync(`public${frame.image}`).size : 0),
    0
  )

const lines: string[] = [
  `changes: ${shipped.length} shipped of ${CHANGE_SEEDS.length} seeds`,
  `committed imagery: ${(bytes / 1024 / 1024).toFixed(1)} MB across ${shipped.length * 2} frames ` +
    `(${Math.round(bytes / 1024 / Math.max(1, shipped.length * 2))} KB average)`,
  '',
  `by region (max ${MAX_REGION_SHARE * 100}% of the deck):`,
  ...[...byRegion.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([region, count]) => `  ${region}\t${count}`),
  '',
  `by kind:`,
  ...Object.entries(
    shipped.reduce<{ [kind: string]: number }>(
      (tally, entry) => ({ ...tally, [entry.kind]: (tally[entry.kind] ?? 0) + 1 }),
      {}
    )
  ).map(([kind, count]) => `  ${kind}\t${count}`),
]
if (thin.length) {
  lines.push(
    '',
    `thin regions (want ${MIN_STORIES_PER_REGION}+):`,
    ...thin.map(([r, c]) => `  ${r}\t${c}`)
  )
}
if (dropped.length) {
  lines.push('', `dropped (${dropped.length}):`, ...dropped.map(d => `  ${d.slug}\t${d.reason}`))
}

writeFileSync('generators/data/changes-report.txt', `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
