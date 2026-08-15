import { existsSync, writeFileSync } from 'node:fs'
import { pickMediaCredit, type MediaCredit } from '../../../lib/attribution'
import type { Fame } from '../../../types/fame.types'
import { isValidISOCode, type ISOCountryCode } from '../../../types/geography.types'
import type { PlaceEntry, PlaceMapping } from '../../../types/places.types'
import type { CountryShapes } from '../naturalearth/country-shapes'
import {
  captureImageCredit,
  existingImagePath,
  fetchImageDimensions,
  fetchJson,
  saveCommonsImage,
  wait,
} from './commons'

/** Re-exported so a place generator has one import site for the pipeline. */
export { fetchJson, fetchPageImages, wait } from './commons'

/**
 * The pipeline every roster of photographed places shares: resolve a country,
 * sanity-check a point against its polygons, pull a viable Commons photo with
 * its credit, rank the roster by fame, and write the `.gen.ts`.
 *
 * The two rosters (curated landmark seeds, swept World Heritage register)
 * differ only in how they CHOOSE their subjects. Everything downstream of that
 * choice lives here, so a fix to the credit capture or the coordinate guard
 * lands on both at once instead of on whichever generator was edited.
 */

// --- Wikidata statement plumbing ---------------------------------------------

export interface GlobeCoordinate {
  latitude: number
  longitude: number
  precision?: number
}

export type StatementValue = string | { id?: string } | GlobeCoordinate | undefined

export interface Statement {
  rank: 'preferred' | 'normal' | 'deprecated'
  mainsnak?: { datavalue?: { value?: StatementValue } }
  qualifiers?: { [property: string]: { datavalue?: { value?: { time?: string } } }[] }
}

export interface Entity {
  claims?: { [property: string]: Statement[] }
  labels?: { en?: { value: string } }
  descriptions?: { en?: { value: string } }
  sitelinks?: { [site: string]: unknown }
}

export interface EntityResponse {
  entities?: { [id: string]: Entity }
}

export interface LabelResponse {
  entities?: { [id: string]: { labels?: { en?: { value: string } } } }
}

export const isGlobeCoordinate = (value: StatementValue): value is GlobeCoordinate =>
  typeof value === 'object' && value !== null && 'latitude' in value

/** An `wikibase-entityid` datavalue — a reference to another Q-item. */
export const entityId = (value: StatementValue): string | undefined =>
  typeof value === 'object' && value !== null && 'id' in value ? value.id : undefined

/** Non-deprecated statements, preferred rank first. */
export const ranked = (statements: Statement[] = []): Statement[] =>
  statements
    .filter(statement => statement.rank !== 'deprecated')
    .sort((a, b) => (a.rank === 'preferred' ? -1 : 0) - (b.rank === 'preferred' ? -1 : 0))

/** The first non-deprecated value of a property. */
export const claimValue = (
  claims: Entity['claims'],
  property: string
): StatementValue | undefined => ranked(claims?.[property])[0]?.mainsnak?.datavalue?.value

/** The point (P625) of an entity, when it has one. */
export const coordinatesOf = (
  claims: Entity['claims']
): { lat: number; lng: number } | undefined => {
  const point = claimValue(claims, 'P625')
  return isGlobeCoordinate(point) ? { lat: point.latitude, lng: point.longitude } : undefined
}

interface SearchResponse {
  query?: { search?: { title: string }[] }
  continue?: { sroffset: number }
}

/** Every Q-id matching a `haswbstatement:` search, following continuations. */
export const paginatedSearch = async (query: string): Promise<string[]> => {
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

/**
 * Both directions of the country map, from one sweep of `P297` (ISO 3166-1
 * alpha-2). Wikidata knows more ISO codes than the game does (Greenland,
 * Curaçao, the Marshall Islands…); anything outside the game's set is left out
 * of both maps rather than emitted with an untyped country.
 */
export const fetchCountryQidMap = async (): Promise<{
  isoToQid: Map<ISOCountryCode, string>
  qidToIso: Map<string, ISOCountryCode>
}> => {
  const countryEntityIds = await paginatedSearch('haswbstatement:P297')
  const isoToQid = new Map<ISOCountryCode, string>()
  const qidToIso = new Map<string, ISOCountryCode>()
  for (let index = 0; index < countryEntityIds.length; index += 20) {
    const batch = countryEntityIds.slice(index, index + 20)
    const data = await fetchJson<EntityResponse>(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=claims&format=json`
    )
    for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
      const value = claimValue(entity.claims, 'P297')
      if (!isValidISOCode(value)) continue
      if (!isoToQid.has(value)) isoToQid.set(value, qid)
      if (!qidToIso.has(qid)) qidToIso.set(qid, value)
    }
    await wait(200)
  }
  return { isoToQid, qidToIso }
}

/** English labels for a set of Q-ids, batched. */
export const fetchLabels = async (qids: string[]): Promise<Map<string, string>> => {
  const labels = new Map<string, string>()
  for (let index = 0; index < qids.length; index += 50) {
    const batch = qids.slice(index, index + 50)
    const data = await fetchJson<LabelResponse>(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join('|')}&props=labels&languages=en&languagefallback=1&format=json`
    )
    for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
      if (entity.labels?.en?.value) labels.set(qid, entity.labels.en.value)
    }
    await wait(200)
  }
  return labels
}

// --- Slugs, photo budget, coordinate guard ------------------------------------

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Every place photo is a prompt inside `ZoomableImage` (MAX_SCALE 5), so they
 * all need real pixels. One width for both rosters — heritage sat at 1400 on
 * the strength of a comment saying it was "never pixel-zoomed", which stopped
 * being true when Heritage Hunt adopted the same zoomable frame.
 */
export const PLACE_PHOTO_WIDTH = 2000

/** Reject images whose SOURCE is smaller than this — they look bad upscaled. */
export const MIN_PLACE_IMAGE_WIDTH = 900

/**
 * How far outside its country a place's point may sit before we disown it.
 *
 * A name that doesn't resolve on Wikidata lands on something else entirely —
 * "Persepolis" on Persepolis F.C., the football club. Coordinates catch that:
 * the wrong entity is almost always in the wrong hemisphere. The threshold is
 * set from the real distribution — genuine places sit at most ~36km outside
 * their country's 10m polygon (islands, coastlines, points like the Statue of
 * Liberty or Everest on a shared border), while confirmed wrong-entity hits
 * were 4,300km and 13,600km out. Nothing real falls between.
 */
export const MAX_KM_OUTSIDE_COUNTRY = 100

/** Is this point close enough to `country` to believe the match? Returns the
 *  overshoot in km when it is not, for the caller's warning. */
export const placeSitsInCountry = (
  shapes: CountryShapes,
  country: ISOCountryCode,
  point: { lat: number; lng: number }
): { inside: true } | { inside: false; kmOutside: number } => {
  if (!shapes.has(country)) return { inside: true }
  if (shapes.contains(country, point.lat, point.lng)) return { inside: true }
  const kmOutside = shapes.distanceToBorderKm(country, point.lat, point.lng)
  return kmOutside <= MAX_KM_OUTSIDE_COUNTRY ? { inside: true } : { inside: false, kmOutside }
}

/** Trim a point to the precision the game actually pins against. */
export const roundCoordinates = (point: { lat: number; lng: number }) => ({
  lat: Math.round(point.lat * 10000) / 10000,
  lng: Math.round(point.lng * 10000) / 10000,
})

// --- Photo + credit -----------------------------------------------------------

export type PlacePhoto =
  /** Downloaded this run. */
  | { status: 'saved'; image: string; media: MediaCredit }
  /** Already on disk from an earlier run — still credited. */
  | { status: 'existing'; image: string; media: MediaCredit }
  /** Source too small to ship. */
  | { status: 'rejected' }
  /** No photo on the item at all, or the download failed. */
  | { status: 'missing' }

export const placeHasPhoto = (photo: PlacePhoto): photo is Extract<PlacePhoto, { image: string }> =>
  photo.status === 'saved' || photo.status === 'existing'

/**
 * The Commons half of a place's photo: reuse what is on disk, else size-check
 * and download, and either way come back with the credit.
 *
 * Resolving the credit even for a file already on disk is the point — a run
 * that skipped the download used to skip the attribution with it, which is how
 * a whole roster ended up shipping uncredited photos.
 */
export const savePlacePhoto = async ({
  file,
  slug,
  directory,
  publicBase,
  previous,
  force = false,
  width = PLACE_PHOTO_WIDTH,
}: {
  /** Commons filename from `fetchPageImages`, when the item had one. */
  file: string | undefined
  slug: string
  /** Where the .webp is written, e.g. `public/landmarks`. */
  directory: string
  /** How the game addresses it, e.g. `/landmarks`. */
  publicBase: string
  previous?: MediaCredit
  force?: boolean
  width?: number
}): Promise<PlacePhoto> => {
  const base = `${directory}/${slug}`
  const publicPath = `${publicBase}/${slug}`
  const credit = async (): Promise<MediaCredit> =>
    pickMediaCredit({
      ...(await captureImageCredit(file, previous, force)),
      ...(file ? { imageSource: 'commons-media' as const } : {}),
    }) ?? {}

  const existing = force ? undefined : existingImagePath(base, publicPath)
  if (existing) return { status: 'existing', image: existing, media: await credit() }

  if (!file) return { status: 'missing' }

  const dimensions = await fetchImageDimensions(file)
  if (dimensions && dimensions.width < MIN_PLACE_IMAGE_WIDTH) {
    await wait(120)
    return { status: 'rejected' }
  }

  const saved = await saveCommonsImage(file, base, publicPath, { width, force })
  if (!saved) return { status: 'missing' }
  return { status: 'saved', image: saved, media: await credit() }
}

// --- Fame ----------------------------------------------------------------------

/**
 * Fame by rank within a country: the icon, its well-known second, then the
 * rest. Callers hand over a list already ordered by whatever fame signal their
 * roster has — the seed file's deliberate ordering for landmarks, the Wikipedia
 * sitelink count for the heritage sweep — and this turns that ordering into the
 * tier the game gates on, so the ranking stops being an implicit property of
 * array order that any merge step could quietly scramble.
 */
export const FAME_BY_COUNTRY_RANK: readonly Fame[] = ['major', 'minor']
export const fameForCountryRank = (rank: number): Fame => FAME_BY_COUNTRY_RANK[rank] ?? 'obscure'

/**
 * Stamp `fame` onto each item from its rank within its own country. An item
 * that already carries an explicit tier keeps it — a curator overriding the
 * ordering still consumes its rank, so overriding one entry never promotes the
 * one behind it.
 */
export const assignFameByCountry = <T extends { country: ISOCountryCode; fame?: Fame }>(
  items: T[]
): (T & { fame: Fame })[] => {
  const seen = new Map<ISOCountryCode, number>()
  return items.map(item => {
    const rank = seen.get(item.country) ?? 0
    seen.set(item.country, rank + 1)
    return { ...item, fame: item.fame ?? fameForCountryRank(rank) }
  })
}

// --- Merge + write --------------------------------------------------------------

/**
 * Merge the previous run in, so a transient network failure never erases a
 * captured place. Two guards: the slug must still belong to the roster (a
 * renamed place shouldn't linger), and its image must still be on disk — the
 * coordinate check deletes the photo of a wrong-item match, and resurrecting
 * that entry would point the game at a file we just removed.
 */
export const carryPreviousPlaces = <Entry extends PlaceEntry>(
  mapping: PlaceMapping<Entry>,
  previous: PlaceMapping<Entry>,
  { stillInRoster }: { stillInRoster?: (slug: string) => boolean } = {}
): number => {
  let carried = 0
  for (const [slug, entry] of Object.entries(previous)) {
    if (mapping[slug]) continue
    if (stillInRoster && !stillInRoster(slug)) continue
    if (!existsSync(`public${entry.image}`)) {
      console.warn(`  dropping "${entry.name}" — its image is gone`)
      continue
    }
    mapping[slug] = entry
    carried++
  }
  return carried
}

/** Write a roster's `.gen.ts`, one header shape for both. */
export const writePlacesFile = ({
  path,
  generator,
  typeImport,
  constant,
  type,
  mapping,
}: {
  path: string
  generator: string
  /** Module the mapping type comes from, e.g. `~~/types/places.types`. */
  typeImport: string
  constant: string
  type: string
  mapping: object
}) => {
  writeFileSync(
    path,
    `// Generated by ${generator} — do not edit by hand.
import type { ${type} } from '${typeImport}'
export const ${constant}: ${type} = ${JSON.stringify(mapping)}
`
  )
  console.log(`Wrote ${path} (${Object.keys(mapping).length} places)`)
}
