/**
 * Generates the Ghosts of Empires datasets from two historical-border sources:
 *
 *   data/empires.gen.ts       — per-empire metadata (dealer, static import)
 *   data/empire-paths.gen.ts  — keyframe extent paths (view, lazy import)
 *   data/empire-flags.gen.ts  — historical flag markup (view, lazy import)
 *
 * Sources, both pinned:
 *   historical-basemaps (GPL-3.0) — world snapshots 2000 BC–2010; features
 *     carry NAME / SUBJECTO (colonial overlord) / PARTOF / BORDERPRECISION.
 *   CShapes 2.0 (CC BY-NC-SA 4.0; cite Schvitz et al. 2022, Journal of
 *     Conflict Resolution) — state borders 1886–2019, dated to the day.
 *     The NC licence is why this generator stays out of the CI cron.
 *
 * Every keyframe goes through one shared chute: select features by verbatim
 * alias (a miss throws with nearest-value suggestions — that error message IS
 * the curation loop), one topology per empire across ALL its keyframes so
 * adjacent frames simplify identically (no morph jitter), merge into a blob,
 * project through the map's fitted Robinson, and emit polyline-only paths
 * that round-trip through lib/outline's parsePolygons.
 *
 *   bun run generate:empires [--audit <year>] [--force-flags]
 *
 * Run after generate:map (projection dependency).
 */
import { jsonParseLiteral } from '../../lib/emit'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { geoRobinson } from 'd3-geo-projection'
import { topology } from 'topojson-server'
import { presimplify, quantile, simplify } from 'topojson-simplify'
import { merge } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import { ISOCountryCodes } from '../../../data/iso-codes.gen'
import { MAP_PROJECTION, MAP_PATHS, MAP_REGIONS } from '../../../data/map.gen'
import { editDistance } from '../../../lib/strings'
import { parsePolygons } from '../../../lib/outline'
import type { ISOCountryCode } from '../../../types/geography.types'
import { EMPIRE_SEEDS } from '../../data/empire-seeds'
import type { EmpireKeyframeSpec, EmpireSeed } from '../../data/empire-seeds'
import { fetchCommonsSvgText, fetchImageAttribution, wait } from '../wikidata/commons'

// Pinned: historical-basemaps has no releases, so pin a commit like NE pins a tag.
const BASEMAPS_COMMIT = '62d8f1a03a71f2d3ff17f2d166f7553f256bce68'
const CSHAPES_URL = 'https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson'
const CACHE_DIR = `${import.meta.dirname}/.cache`
const OUT_META = 'data/empires.gen.ts'
const OUT_PATHS = 'data/empire-paths.gen.ts'
const OUT_FLAGS = 'data/empire-flags.gen.ts'
const FLAG_DIR = 'data/static/flags/empires'
const HANDMADE_DIR = 'data/static/empires'
const REPORT_FILE = 'generators/data/empires-report.txt'

/** The snapshot menu the repo actually ships — seed years must come from it. */
const AVAILABLE_BASEMAP_YEARS = new Set([
  -123000, -10000, -8000, -5000, -4000, -3000, -2000, -1500, -1000, -700, -500, -400, -323, -300,
  -200, -100, -1, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1279, 1300, 1400,
  1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800, 1815, 1880, 1900, 1914, 1920, 1930, 1938,
  1945, 1960, 1994, 2000, 2010,
])

/** Simplification targets a point BUDGET per empire rather than a fraction:
 *  day-precision CShapes coastlines get cut hard, while an already-coarse
 *  hand-traced frame passes through untouched (a fraction would gut it). */
const POINT_BUDGET = 5000
/** Decimation gap scales with the empire's footprint — a world-spanning blob
 *  can spend 1.6 units between points, a Gran Colombia needs 0.3 to keep any
 *  shape at all. gap = clamp(maxSpan / 400, MIN, MAX). */
const DECIMATE_MIN = 0.3
const DECIMATE_MAX = 2.4
const DECIMATE_SPAN_DIVISOR = 400
/** Islet-ring area floor, likewise footprint-scaled: Arctic archipelago specks
 *  are noise on a USSR-sized ghost but a real island matters on a small one. */
const MIN_RING_AREA = 2.5
const MAX_RING_AREA_FLOOR = 12
const RING_AREA_SPAN_DIVISOR = 150
/** Rings per keyframe beyond this are dropped smallest-first, with a warning —
 *  the client morph pairs rings across frames and specks pair as garbage. */
const RING_CAP = 12
/** Raw-bytes guardrail for the single-file paths decision (plan §Part A). */
const PATHS_BYTES_WARN = 2.5 * 1024 * 1024
/** Membership-aid grid step over country boxes (viewBox units). */
const MEMBER_SAMPLE_STEP = 3
/** Membership-aid thresholds on coverage of a country by the peak extent. */
const CORE_COVERAGE = 0.5
const PARTIAL_COVERAGE = 0.05

type Point = [number, number]

const projection = geoRobinson().scale(MAP_PROJECTION.scale).translate(MAP_PROJECTION.translate)
const project = ([lon, lat]: Point): Point => projection([lon, lat]) as Point

const roundTo = (value: number, decimals = 2) => Number(value.toFixed(decimals))

// --- Fetch / cache -------------------------------------------------------------

const basemapTag = (year: number) => (year < 0 ? `bc${-year}` : String(year))

const fetchCached = async (cacheName: string, url: string): Promise<string> => {
  const cachePath = `${CACHE_DIR}/${cacheName}`
  if (!existsSync(cachePath)) {
    console.info(`Downloading ${url}`)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Download failed: ${response.status} for ${url}`)
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(cachePath, await response.text())
  }
  return readFileSync(cachePath, 'utf-8')
}

const basemapCache = new Map<number, FeatureCollection>()
const fetchBasemaps = async (year: number): Promise<FeatureCollection> => {
  if (!AVAILABLE_BASEMAP_YEARS.has(year))
    throw new Error(`No historical-basemaps snapshot for year ${year} — check the pinned menu`)
  const cached = basemapCache.get(year)
  if (cached) return cached
  const tag = basemapTag(year)
  const text = await fetchCached(
    `world_${tag}.geojson`,
    `https://raw.githubusercontent.com/aourednik/historical-basemaps/${BASEMAPS_COMMIT}/geojson/world_${tag}.geojson`
  )
  const collection = JSON.parse(text) as FeatureCollection
  basemapCache.set(year, collection)
  return collection
}

interface CShapesFeature {
  feature: Feature<Polygon | MultiPolygon>
  name: string
  gwcode: number
  start: [number, number, number]
  end: [number, number, number]
}

let cshapesFeatures: CShapesFeature[] | undefined
const fetchCShapes = async (): Promise<CShapesFeature[]> => {
  if (cshapesFeatures) return cshapesFeatures
  const text = await fetchCached('CShapes-2.0.geojson', CSHAPES_URL)
  const collection = JSON.parse(text) as FeatureCollection
  cshapesFeatures = collection.features
    .filter(
      feature => feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon'
    )
    .map(feature => {
      const properties = (feature.properties ?? {}) as Record<string, unknown>
      // The date strings are locale-formatted; the numeric y/m/d fields are not.
      return {
        feature: feature as Feature<Polygon | MultiPolygon>,
        name: String(properties.cntry_name ?? '').trim(),
        gwcode: Number(properties.gwcode ?? -1),
        start: [
          Number(properties.gwsyear),
          Number(properties.gwsmonth),
          Number(properties.gwsday),
        ] as [number, number, number],
        end: [
          Number(properties.gweyear),
          Number(properties.gwemonth),
          Number(properties.gweday),
        ] as [number, number, number],
      }
    })
  return cshapesFeatures
}

const dateTuple = (date: string): [number, number, number] => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error(`CShapes slice date must be YYYY-MM-DD, got '${date}'`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

const tupleCompare = (a: [number, number, number], b: [number, number, number]) =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

// --- Alias matching with suggestions ---------------------------------------------

const nearestValues = (target: string, candidates: Iterable<string>, count = 5): string[] => {
  const lowered = target.toLowerCase()
  return [...new Set(candidates)]
    .map(value => {
      const valueLowered = value.toLowerCase()
      // Substring hits rank above pure edit distance — "Ghana" should surface
      // "Kingdom of Ghana" before "Chad".
      const score = valueLowered.includes(lowered)
        ? 0
        : editDistance(lowered, valueLowered) / Math.max(lowered.length, valueLowered.length)
      return { value, score }
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map(entry => entry.value)
}

const property = (feature: Feature, key: string): string => {
  const value = (feature.properties ?? ({} as Record<string, unknown>))[key]
  return value === null || value === undefined ? '' : String(value).trim()
}

// --- Geometry helpers -------------------------------------------------------------

const asPolygonRings = (geometry: Polygon | MultiPolygon): Point[][] =>
  geometry.type === 'Polygon'
    ? (geometry.coordinates as Point[][])
    : (geometry.coordinates as Point[][][]).flat()

/**
 * Split rings that cross the antimeridian into a west part and an east part
 * BEFORE topology, so point-by-point projection can never smear a band across
 * the map (USSR's Chukotka, the Russian Empire, Japan's Pacific holdings).
 * Works in a continuous longitude domain (negatives shifted +360), then clips
 * against lon = 180 with a half-plane Sutherland–Hodgman pass per side.
 */
const splitAtAntimeridian = (ring: Point[]): Point[][] => {
  const lons = ring.map(([lon]) => lon)
  const crosses = Math.max(...lons) > 170 && Math.min(...lons) < -170
  if (!crosses) return [ring]

  const continuous: Point[] = ring.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat])

  const clipHalfPlane = (points: Point[], keepWest: boolean): Point[] => {
    const inside = ([lon]: Point) => (keepWest ? lon <= 180 : lon >= 180)
    const output: Point[] = []
    for (let i = 0; i < points.length; i++) {
      const current = points[i]
      const previous = points[(i + points.length - 1) % points.length]
      const currentIn = inside(current)
      const previousIn = inside(previous)
      if (currentIn !== previousIn) {
        const t = (180 - previous[0]) / (current[0] - previous[0])
        output.push([180, previous[1] + (current[1] - previous[1]) * t])
      }
      if (currentIn) output.push(current)
    }
    return output
  }

  const west = clipHalfPlane(continuous, true)
  const east = clipHalfPlane(continuous, false).map(([lon, lat]): Point => [
    lon === 180 ? -180 : lon - 360,
    lat,
  ])
  return [west, east].filter(part => part.length >= 3)
}

const splitFeature = (
  feature: Feature<Polygon | MultiPolygon>
): Feature<Polygon | MultiPolygon> => {
  const rings = asPolygonRings(feature.geometry).flatMap(splitAtAntimeridian)
  return {
    ...feature,
    // Each ring becomes its own single-ring polygon: hole topology is lost,
    // which is fine for ghost blobs (holes below MIN_RING_AREA vanish anyway).
    geometry: { type: 'MultiPolygon', coordinates: rings.map(ring => [ring]) },
  }
}

const decimate = (points: Point[], minGap: number): Point[] => {
  const output: Point[] = []
  for (const point of points) {
    const previous = output[output.length - 1]
    if (previous && Math.hypot(point[0] - previous[0], point[1] - previous[1]) < minGap) continue
    output.push([roundTo(point[0]), roundTo(point[1])])
  }
  return output
}

const ringArea = (ring: Point[]): number => {
  let area = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  }
  return Math.abs(area / 2)
}

const boundsOf = (pointGroups: Point[][]): [number, number, number, number] => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const points of pointGroups)
    for (const [x, y] of points) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  return [roundTo(minX), roundTo(minY), roundTo(maxX - minX), roundTo(maxY - minY)]
}

const unionBounds = (
  boxes: [number, number, number, number][]
): [number, number, number, number] => {
  const minX = Math.min(...boxes.map(([x]) => x))
  const minY = Math.min(...boxes.map(([, y]) => y))
  const maxX = Math.max(...boxes.map(([x, , w]) => x + w))
  const maxY = Math.max(...boxes.map(([, y, , h]) => y + h))
  return [roundTo(minX), roundTo(minY), roundTo(maxX - minX), roundTo(maxY - minY)]
}

const pathFromRings = (rings: Point[][]): string =>
  rings
    .filter(ring => ring.length >= 3)
    .map(ring => `M ${ring.map(([x, y]) => `${x},${y}`).join(' L ')} z`)
    .join(' ')

const pointInRings = (point: Point, rings: Point[][]): boolean => {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (
        yi > point[1] !== yj > point[1] &&
        point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
      ) {
        inside = !inside
      }
    }
  }
  return inside
}

// --- Seed gates (THROW — a bad seed crashes a room, per the HK postmortem) --------

const validateSeeds = (seeds: EmpireSeed[]) => {
  const problems: string[] = []
  const ids = new Set<string>()
  for (const seed of seeds) {
    const where = seed.id || seed.name
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(seed.id)) problems.push(`${where}: id must be kebab-case`)
    if (ids.has(seed.id)) problems.push(`${where}: duplicate id`)
    ids.add(seed.id)

    if (seed.keyframes.length < 4 || seed.keyframes.length > 8)
      problems.push(`${where}: ${seed.keyframes.length} keyframes (need 4–8)`)
    const years = seed.keyframes.map(keyframe => keyframe.year)
    if (years.some((year, index) => index > 0 && year <= years[index - 1]))
      problems.push(`${where}: keyframe years must be strictly ascending`)
    if (!years.includes(seed.peakYear))
      problems.push(`${where}: peakYear ${seed.peakYear} is not a keyframe year`)

    for (const keyframe of seed.keyframes) {
      if (keyframe.source === 'basemaps' && !AVAILABLE_BASEMAP_YEARS.has(keyframe.year))
        problems.push(`${where}: no basemaps snapshot for ${keyframe.year}`)
      if (keyframe.source === 'cshapes') {
        const [year] = dateTuple(keyframe.date)
        if (year < 1886 || year > 2019)
          problems.push(`${where}: CShapes covers 1886–2019, got ${keyframe.date}`)
        if (!keyframe.name?.length && !keyframe.gwcode?.length)
          problems.push(`${where}: cshapes keyframe ${keyframe.year} needs name or gwcode`)
      }
      if (keyframe.source === 'handmade' && !existsSync(`${HANDMADE_DIR}/${keyframe.file}`))
        problems.push(`${where}: missing ${HANDMADE_DIR}/${keyframe.file}`)
      if (
        keyframe.source === 'basemaps' &&
        !keyframe.name?.length &&
        !keyframe.subjecto?.length &&
        !keyframe.partof?.length
      )
        problems.push(`${where}: basemaps keyframe ${keyframe.year} selects nothing`)
    }

    const members = [...seed.members.core, ...seed.members.partial]
    for (const code of members)
      if (!(ISOCountryCodes as readonly string[]).includes(code))
        problems.push(`${where}: '${code}' is not a playable ISO code`)
    if (seed.members.core.some(code => seed.members.partial.includes(code)))
      problems.push(`${where}: core and partial overlap`)
    if (!seed.members.core.length) problems.push(`${where}: needs at least one core member`)
  }

  // Regional quota is a product requirement, not advice — refuse to emit past it.
  const europeanCount = seeds.filter(seed => seed.region === 'europe').length
  if (europeanCount > Math.floor(seeds.length / 3))
    problems.push(
      `European quota exceeded: ${europeanCount}/${seeds.length} (max ${Math.floor(seeds.length / 3)})`
    )

  if (problems.length)
    throw new Error(`Empire seeds failed validation:\n  ${problems.join('\n  ')}`)
}

// --- Keyframe feature selection ---------------------------------------------------

const selectBasemapFeatures = (
  collection: FeatureCollection,
  spec: Extract<EmpireKeyframeSpec, { source: 'basemaps' }>,
  seedId: string
): Feature<Polygon | MultiPolygon>[] => {
  const polygonal = collection.features.filter(
    (feature): feature is Feature<Polygon | MultiPolygon> =>
      feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon'
  )
  const selected = new Set<Feature<Polygon | MultiPolygon>>()
  const misses: string[] = []

  const matchField = (field: 'NAME' | 'SUBJECTO' | 'PARTOF', aliases?: string[]) => {
    for (const alias of aliases ?? []) {
      const hits = polygonal.filter(feature => property(feature, field) === alias)
      if (!hits.length) {
        const candidates = polygonal.map(feature => property(feature, field)).filter(Boolean)
        misses.push(
          `${field} '${alias}' matches nothing in world_${basemapTag(spec.year)} — nearest: ${nearestValues(alias, candidates).join(' | ')}`
        )
        continue
      }
      for (const hit of hits) selected.add(hit)
    }
  }
  matchField('NAME', spec.name)
  matchField('SUBJECTO', spec.subjecto)
  matchField('PARTOF', spec.partof)

  if (misses.length) throw new Error(`${seedId} @ ${spec.year}:\n    ${misses.join('\n    ')}`)
  if (!selected.size) throw new Error(`${seedId} @ ${spec.year}: keyframe selected zero features`)
  return [...selected]
}

const selectCShapesFeatures = (
  features: CShapesFeature[],
  spec: Extract<EmpireKeyframeSpec, { source: 'cshapes' }>,
  seedId: string
): Feature<Polygon | MultiPolygon>[] => {
  const slice = dateTuple(spec.date)
  const active = features.filter(
    entry => tupleCompare(entry.start, slice) <= 0 && tupleCompare(slice, entry.end) <= 0
  )
  const selected = new Set<Feature<Polygon | MultiPolygon>>()
  const misses: string[] = []

  for (const name of spec.name ?? []) {
    const hits = active.filter(entry => entry.name === name)
    if (!hits.length) {
      misses.push(
        `cntry_name '${name}' inactive at ${spec.date} — nearest active: ${nearestValues(
          name,
          active.map(entry => entry.name)
        ).join(' | ')}`
      )
      continue
    }
    for (const hit of hits) selected.add(hit.feature)
  }
  for (const gwcode of spec.gwcode ?? []) {
    const hits = active.filter(entry => entry.gwcode === gwcode)
    if (!hits.length) {
      misses.push(`gwcode ${gwcode} inactive at ${spec.date}`)
      continue
    }
    for (const hit of hits) selected.add(hit.feature)
  }

  if (misses.length) throw new Error(`${seedId} @ ${spec.year}:\n    ${misses.join('\n    ')}`)
  if (!selected.size) throw new Error(`${seedId} @ ${spec.year}: keyframe selected zero features`)
  return [...selected]
}

const loadHandmade = (file: string): Feature<Polygon | MultiPolygon>[] => {
  const collection = JSON.parse(
    readFileSync(`${HANDMADE_DIR}/${file}`, 'utf-8')
  ) as FeatureCollection
  return collection.features.filter(
    (feature): feature is Feature<Polygon | MultiPolygon> =>
      feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon'
  )
}

/** min BORDERPRECISION (1 approximate … 3 treaty-precise) across a selection. */
const precisionOf = (spec: EmpireKeyframeSpec, features: Feature[]): number => {
  if (spec.source === 'cshapes') return 3
  if (spec.source === 'handmade') return 1
  const values = features
    .map(feature => Number(property(feature, 'BORDERPRECISION')))
    .filter(value => Number.isFinite(value) && value >= 1 && value <= 3)
  return values.length ? Math.min(...values) : 1
}

// --- Country shapes for the membership aid + capital advisories --------------------

interface CountryShape {
  code: ISOCountryCode
  rings: Point[][]
}

const countryShapes: CountryShape[] = ISOCountryCodes.map(code => ({
  code,
  rings: parsePolygons(MAP_PATHS[code]) as Point[][],
}))

/** Interior sample points per country, over its MAP_REGIONS boxes (a whole-
 *  country bbox lies for RU/US-class antimeridian countries). */
const countrySamples = new Map<ISOCountryCode, Point[]>()
for (const { code, rings } of countryShapes) {
  const samples: Point[] = []
  for (const [x, y, w, h] of MAP_REGIONS[code] ?? []) {
    for (let sx = x; sx <= x + w; sx += MEMBER_SAMPLE_STEP)
      for (let sy = y; sy <= y + h; sy += MEMBER_SAMPLE_STEP) {
        if (pointInRings([sx, sy], rings)) samples.push([sx, sy])
      }
  }
  // Micro-states can fall between grid lines — anchor with ring vertices.
  if (!samples.length && rings[0]?.length) samples.push(...rings[0].slice(0, 4))
  countrySamples.set(code, samples)
}

// --- Flags -------------------------------------------------------------------------

const FORCE_FLAGS = process.argv.includes('--force-flags')

const vendorFlag = async (seed: EmpireSeed): Promise<string | undefined> => {
  if (!seed.commons) return undefined
  const target = `${FLAG_DIR}/${seed.id}.svg`

  if (!existsSync(target) || FORCE_FLAGS) {
    const markup = await fetchCommonsSvgText(seed.commons)
    if (!markup) {
      console.warn(`  flag fetch failed for ${seed.id}: ${seed.commons}`)
      return undefined
    }
    const attribution = await fetchImageAttribution(seed.commons)
    const provenance = `<!-- Source: File:${seed.commons} on Wikimedia Commons | Author: ${attribution?.credit ?? 'unknown'} | Licence: ${attribution?.license ?? 'unknown'} -->\n`
    mkdirSync(FLAG_DIR, { recursive: true })
    // Strip the XML prolog before the provenance comment goes on top — a
    // declaration anywhere but byte 0 makes the committed file invalid XML.
    const body = markup.replace(/<\?xml[^>]*\?>\s*/g, '').replace(/<!DOCTYPE[^>]*>\s*/g, '')
    writeFileSync(target, provenance + body)
    await wait(150)
  }

  const raw = readFileSync(target, 'utf-8')
  if (/<script|\son\w+\s*=|javascript:/i.test(raw))
    throw new Error(`${seed.id}: flag SVG contains active content — refuse to ship`)
  if (raw.length > 60 * 1024)
    console.warn(
      `  ${seed.id}: flag is ${(raw.length / 1024).toFixed(0)} KB — consider a simpler file`
    )

  // Strip prolog + comments so the client's DOMParser sees <svg> as the root.
  return raw
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
}

// --- Audit mode ---------------------------------------------------------------------

const auditIndex = process.argv.indexOf('--audit')
if (auditIndex !== -1) {
  const year = Number(process.argv[auditIndex + 1])
  const collection = await fetchBasemaps(year)
  for (const field of ['NAME', 'SUBJECTO', 'PARTOF'] as const) {
    const values = [...new Set(collection.features.map(f => property(f, field)).filter(Boolean))]
    console.info(`\n--- ${field} (${values.length}) ---\n${values.sort().join('\n')}`)
  }
  process.exit(0)
}

// --- Build --------------------------------------------------------------------------

interface EmpireOutput {
  paths: string[]
  keyframeBounds: [number, number, number, number][]
  precisions: number[]
  bounds: [number, number, number, number]
  peakRings: Point[][]
}

const buildEmpire = async (seed: EmpireSeed): Promise<EmpireOutput> => {
  // Select per-keyframe features, split at the antimeridian before topology.
  const selections: { spec: EmpireKeyframeSpec; features: Feature<Polygon | MultiPolygon>[] }[] = []
  for (const spec of seed.keyframes) {
    const features =
      spec.source === 'basemaps'
        ? selectBasemapFeatures(await fetchBasemaps(spec.year), spec, seed.id)
        : spec.source === 'cshapes'
          ? selectCShapesFeatures(await fetchCShapes(), spec, seed.id)
          : loadHandmade(spec.file)
    if (!features.length) throw new Error(`${seed.id} @ ${spec.year}: no geometry`)
    selections.push({ spec, features: features.map(splitFeature) })
  }

  // One topology across ALL keyframes: shared arcs simplify identically, so
  // consecutive frames stay coherent and the client morph never jitters.
  const objects = Object.fromEntries(
    selections.map(({ features }, index) => [
      `k${index}`,
      { type: 'FeatureCollection', features } as never,
    ])
  )
  type EmpireTopology = Topology<Record<string, GeometryCollection>>
  const topo = topology(objects, 1e7) as EmpireTopology
  const weighted = presimplify(topo)
  const sourcePoints = selections
    .flatMap(({ features }) => features.flatMap(feature => asPolygonRings(feature.geometry)))
    .reduce((total, ring) => total + ring.length, 0)
  const retain = Math.min(1, POINT_BUDGET / Math.max(1, sourcePoints))
  const simplified = simplify(weighted, quantile(weighted, retain)) as EmpireTopology

  // Merge each keyframe into a blob, project, and take a first uncut pass to
  // size the empire (decimation gap scales with footprint).
  const rawRings: Point[][][] = selections.map((_, index) => {
    const merged = merge(
      simplified,
      simplified.objects[`k${index}`].geometries as Parameters<typeof merge>[1]
    )
    return asPolygonRings(merged).map(ring => ring.map(project))
  })
  const footprint = boundsOf(rawRings.flat())
  const maxSpan = Math.max(footprint[2], footprint[3])
  const gap = Math.min(DECIMATE_MAX, Math.max(DECIMATE_MIN, maxSpan / DECIMATE_SPAN_DIVISOR))
  const ringAreaFloor = Math.min(
    MAX_RING_AREA_FLOOR,
    Math.max(MIN_RING_AREA, maxSpan / RING_AREA_SPAN_DIVISOR)
  )

  const paths: string[] = []
  const keyframeBounds: [number, number, number, number][] = []
  const precisions: number[] = []
  let peakRings: Point[][] = []

  for (let index = 0; index < selections.length; index++) {
    const { spec, features } = selections[index]
    let rings = rawRings[index].map(ring => decimate(ring, gap)).filter(ring => ring.length >= 3)

    const largest = rings.reduce((a, b) => (ringArea(a) >= ringArea(b) ? a : b), rings[0] ?? [])
    rings = rings.filter(ring => ring === largest || ringArea(ring) >= ringAreaFloor)
    rings.sort((a, b) => ringArea(b) - ringArea(a))
    if (rings.length > RING_CAP) {
      console.warn(`  ${seed.id} @ ${spec.year}: ${rings.length} rings, capping to ${RING_CAP}`)
      rings = rings.slice(0, RING_CAP)
    }
    if (!rings.length) throw new Error(`${seed.id} @ ${spec.year}: all rings degenerate`)

    const d = pathFromRings(rings)
    if (!parsePolygons(d).length)
      throw new Error(`${seed.id} @ ${spec.year}: emitted path does not parse`)

    paths.push(d)
    keyframeBounds.push(boundsOf(rings))
    precisions.push(precisionOf(spec, features))
    if (spec.year === seed.peakYear) peakRings = rings
  }

  return { paths, keyframeBounds, precisions, bounds: unionBounds(keyframeBounds), peakRings }
}

const main = async () => {
  validateSeeds(EMPIRE_SEEDS)

  const meta: Record<string, unknown> = {}
  const allPaths: Record<string, string[]> = {}
  const allBounds: Record<string, [number, number, number, number][]> = {}
  const allPrecisions: Record<string, number[]> = {}
  const flags: Record<string, string> = {}
  const reportLines: string[] = []
  const noFlag: string[] = []
  const capitalAdvisories: string[] = []
  const membershipLines: string[] = []
  const weights: { id: string; bytes: number }[] = []

  for (const seed of EMPIRE_SEEDS) {
    console.info(`Building ${seed.id}…`)
    const built = await buildEmpire(seed)

    // Capitals: project and gate; a capital off the viewBox is a typo'd seed.
    const capitals = seed.capitals.map(capital => {
      const [x, y] = project(capital.coordinates)
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 2000 || y < 0 || y > 1001)
        throw new Error(`${seed.id}: capital ${capital.name} projects off the map`)
      if (!pointInRings([x, y], built.peakRings))
        capitalAdvisories.push(`${seed.id}: ${capital.name} falls outside the peak extent`)
      return {
        name: capital.name,
        x: roundTo(x),
        y: roundTo(y),
        ...(capital.from !== undefined ? { from: capital.from } : {}),
        ...(capital.to !== undefined ? { to: capital.to } : {}),
      }
    })

    // Membership aid (report-only): what the peak geometry says vs the seed.
    const suggested = { core: [] as string[], partial: [] as string[] }
    const weak: string[] = []
    for (const code of ISOCountryCodes) {
      const samples = countrySamples.get(code) ?? []
      if (!samples.length) continue
      const inside = samples.filter(point => pointInRings(point, built.peakRings)).length
      const coverage = inside / samples.length
      const listed = seed.members.core.includes(code) || seed.members.partial.includes(code)
      if (coverage >= CORE_COVERAGE && !listed) suggested.core.push(code)
      else if (coverage >= PARTIAL_COVERAGE && !listed) suggested.partial.push(code)
      if (seed.members.core.includes(code) && coverage < 0.3) weak.push(code)
    }
    if (suggested.core.length || suggested.partial.length)
      membershipLines.push(
        `${seed.id}: suggested but unlisted — core: ${suggested.core.join(' ') || '—'}, partial: ${suggested.partial.join(' ') || '—'}`
      )
    if (weak.length)
      membershipLines.push(`${seed.id}: listed core but peak overlap < 0.3 — ${weak.join(' ')}`)

    const flag = await vendorFlag(seed)
    if (flag) flags[seed.id] = flag
    else if (seed.commons) noFlag.push(seed.id)
    else noFlag.push(`${seed.id} (no commons override)`)

    meta[seed.id] = {
      id: seed.id,
      name: seed.name,
      ...(seed.answerAliases?.length ? { answerAliases: seed.answerAliases } : {}),
      region: seed.region,
      tier: seed.tier,
      keyframeYears: seed.keyframes.map(keyframe => keyframe.year),
      peakYear: seed.peakYear,
      members: seed.members,
      capitals,
      bounds: built.bounds,
      blurb: seed.blurb,
      ...(seed.eventSlugs?.length ? { eventSlugs: seed.eventSlugs } : {}),
      hasFlag: Boolean(flag),
    }
    allPaths[seed.id] = built.paths
    allBounds[seed.id] = built.keyframeBounds
    allPrecisions[seed.id] = built.precisions
    weights.push({ id: seed.id, bytes: built.paths.join('').length })
  }

  // --- Emit ---------------------------------------------------------------------
  const sortRecord = <T>(record: Record<string, T>) =>
    Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)))

  const attribution = `// Sources: historical-basemaps (github.com/aourednik/historical-basemaps @ ${BASEMAPS_COMMIT.slice(0, 7)}, GPL-3.0)
// and CShapes 2.0 (icr.ethz.ch/data/cshapes, CC BY-NC-SA 4.0 — Schvitz, Girardin,
// Rüegger, Walter, Cederman & Weidmann 2022, Journal of Conflict Resolution).
// Projected with the map's fitted Robinson (see data/map.gen.ts).`

  const metaOutput = `// Generated by generators/vendors/history/create-empires.ts — do not edit by hand.
${attribution}
import type { ISOCountryCode } from '~~/types/geography.types'
import type { EmpireRegion, EmpireTier } from '~~/generators/data/empire-seeds'

export interface Empire {
  id: string
  name: string
  /** Accepted alternate answers for the beat-1 buzz. */
  answerAliases?: string[]
  region: EmpireRegion
  tier: EmpireTier
  /** Index-aligned with EMPIRE_PATHS[id] in data/empire-paths.gen. */
  keyframeYears: number[]
  /** Beat 2 freezes here; always one of keyframeYears. */
  peakYear: number
  /** core = scoreable at peak; partial = confessed at reveal, never scored. */
  members: { core: ISOCountryCode[]; partial: ISOCountryCode[] }
  /** Map-space capital stars, with optional scrubber visibility windows. */
  capitals: { name: string; x: number; y: number; from?: number; to?: number }[]
  /** Union across all keyframes, for the camera. */
  bounds: [number, number, number, number]
  blurb: string
  /** Timeline cross-links into data/events.gen EVENTS; may dangle after a regen. */
  eventSlugs?: string[]
  hasFlag: boolean
}

export const EMPIRES: Record<string, Empire> = ${JSON.stringify(sortRecord(meta))}
`

  const pathsOutput = `// Generated by generators/vendors/history/create-empires.ts — do not edit by hand.
${attribution}
// Keyframe extent paths in map space (M x,y L … z, parsePolygons-compatible),
// index-aligned with EMPIRES[id].keyframeYears. Lazy-import only — this file
// is heavy and a round needs a single empire.

export const EMPIRE_PATHS: Record<string, string[]> = ${jsonParseLiteral(sortRecord(allPaths))}

export const EMPIRE_KEYFRAME_BOUNDS: Record<string, [number, number, number, number][]> = ${jsonParseLiteral(sortRecord(allBounds))}

/** BORDERPRECISION per keyframe (1 approximate … 3 treaty-precise) — the view
 *  renders vaguer frames blurrier. */
export const EMPIRE_KEYFRAME_PRECISION: Record<string, number[]> = ${JSON.stringify(sortRecord(allPrecisions))}
`

  const flagsOutput = `// Generated by generators/vendors/history/create-empires.ts — do not edit by hand.
// Historical flags from Wikimedia Commons; provenance headers live on the
// committed originals in ${FLAG_DIR}/. Split from empires.gen so the dealer's
// static metadata import never carries flag markup.

export const EMPIRE_FLAGS: Record<string, string> = ${jsonParseLiteral(sortRecord(flags))}
`

  writeFileSync(OUT_META, metaOutput)
  writeFileSync(OUT_PATHS, pathsOutput)
  writeFileSync(OUT_FLAGS, flagsOutput)

  if (Buffer.byteLength(pathsOutput) > PATHS_BYTES_WARN)
    console.warn(
      `paths file exceeds ${(PATHS_BYTES_WARN / 1024 / 1024).toFixed(1)} MB raw — revisit the per-empire chunking fallback in the plan`
    )

  // --- Report --------------------------------------------------------------------
  const regions = new Map<string, number>()
  for (const seed of EMPIRE_SEEDS) regions.set(seed.region, (regions.get(seed.region) ?? 0) + 1)
  reportLines.push(`empires: ${EMPIRE_SEEDS.length} shipped of ${EMPIRE_SEEDS.length} seeds`, '')
  reportLines.push(
    `regions: ${[...regions.entries()].map(([region, count]) => `${region}:${count}`).join(' ')} (europe share ${(((regions.get('europe') ?? 0) / EMPIRE_SEEDS.length) * 100).toFixed(0)}%)`,
    ''
  )
  reportLines.push(`no flag (${noFlag.length}) — add a commons override:`)
  reportLines.push(...noFlag.map(line => `  ${line}`), '')
  reportLines.push(`capitals outside their peak extent (${capitalAdvisories.length}):`)
  reportLines.push(...capitalAdvisories.map(line => `  ${line}`), '')
  reportLines.push('membership aid (geometry vs curated lists — curator judgment wins):')
  reportLines.push(
    ...(membershipLines.length ? membershipLines.map(line => `  ${line}`) : ['  all clear']),
    ''
  )
  const heaviest = weights.sort((a, b) => b.bytes - a.bytes).slice(0, 10)
  reportLines.push('heaviest empires by path bytes:')
  reportLines.push(...heaviest.map(({ id, bytes }) => `  ${id}\t${(bytes / 1024).toFixed(1)} KB`))
  writeFileSync(REPORT_FILE, reportLines.join('\n') + '\n')

  for (const [file, output] of [
    [OUT_META, metaOutput],
    [OUT_PATHS, pathsOutput],
    [OUT_FLAGS, flagsOutput],
  ] as const) {
    const bytes = Buffer.byteLength(output)
    console.info(
      `Output: ${(bytes / 1024).toFixed(0)} KB raw, ${(Bun.gzipSync(Buffer.from(output)).byteLength / 1024).toFixed(0)} KB gzip → ${file}`
    )
  }
  console.info(`Report → ${REPORT_FILE}`)
}

await main()
