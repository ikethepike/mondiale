/**
 * Generates data/water.gen.ts — named physical geography for the water game
 * modes — from Natural Earth 1:10m physical layers (public domain):
 *
 *   geography_marine_polys → seas, gulfs, bays, straits   (name that water,
 *   lakes                  → major lakes                    shared shores)
 *   rivers_lake_centerlines → rivers                        (river run)
 *   geography_regions_polys → ranges, deserts, plateaus     (highlands)
 *
 * Everything is projected with the SAME fitted Robinson as the country map
 * (MAP_PROJECTION from data/map.gen.ts), so features overlay the world
 * exactly. Country adjacency is computed here at build time against the
 * shipped country rings: which countries a river crosses, which shores a
 * sea touches, which countries host a range.
 *
 *   bun run generate:water
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { geoRobinson } from 'd3-geo-projection'
import type { Feature, FeatureCollection, LineString, MultiLineString, MultiPolygon, Polygon } from 'geojson'
import { ISOCountryCodes } from '../../../data/iso-codes.gen'
import { MAP_PROJECTION, MAP_PATHS } from '../../../data/map.gen'
import { parsePolygons } from '../../../lib/outline'
import type { ISOCountryCode } from '../../../types/geography.types'

const NE_TAG = 'v5.1.2'
// import.meta.dirname (Node 20.11+/Bun): typed on ImportMeta, unlike Bun's
// import.meta.dir which the IDE's TS config doesn't know about
const CACHE_DIR = `${import.meta.dirname}/.cache`
const OUT_FILE = 'data/water.gen.ts'

const LAYERS = {
  marine: 'ne_10m_geography_marine_polys',
  lakes: 'ne_10m_lakes',
  rivers: 'ne_10m_rivers_lake_centerlines',
  regions: 'ne_10m_geography_regions_polys',
} as const

/** Marine feature classes that make good questions (oceans are too big). */
const MARINE_KINDS: Record<string, 'sea'> = {
  sea: 'sea',
  gulf: 'sea',
  bay: 'sea',
  strait: 'sea',
  channel: 'sea',
  sound: 'sea',
}

const REGION_KINDS: Record<string, 'range' | 'desert' | 'plateau'> = {
  'Range/mtn': 'range',
  Desert: 'desert',
  Plateau: 'plateau',
}

/** Keep projected points at least this far apart (viewBox units). */
const DECIMATE_UNITS = 0.7
/** A shore counts as touching water within this distance (viewBox units). */
const SHORE_EPSILON = 2.2
/** Rivers shorter than this on the map aren't playable. */
const MIN_RIVER_LENGTH = 18
/** Sample step along rivers for country-crossing tests. */
const RIVER_SAMPLE_STEP = 1.2

type Point = [number, number]

export type WaterKind = 'sea' | 'lake' | 'river' | 'range' | 'desert' | 'plateau'

export interface WaterFeature {
  id: string
  name: string
  kind: WaterKind
  /** Projected path: closed rings for areas, open polylines for rivers. */
  d: string
  bounds: [number, number, number, number]
  /** Playable countries the feature touches/crosses (rivers: in flow order of appearance). */
  countries: ISOCountryCode[]
}

const projection = geoRobinson().scale(MAP_PROJECTION.scale).translate(MAP_PROJECTION.translate)
const project = ([lon, lat]: Point): Point => projection([lon, lat]) as Point

const fetchLayer = async (file: string): Promise<FeatureCollection> => {
  const cachePath = `${CACHE_DIR}/${file}.geojson`
  if (!existsSync(cachePath)) {
    const url = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_TAG}/geojson/${file}.geojson`
    console.info(`Downloading ${url}`)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Natural Earth download failed: ${response.status} for ${file}`)
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(cachePath, await response.text())
  }
  return JSON.parse(readFileSync(cachePath, 'utf-8'))
}

const roundTo = (value: number, decimals = 2) => Number(value.toFixed(decimals))

const decimate = (points: Point[], minGap = DECIMATE_UNITS): Point[] => {
  const output: Point[] = []
  for (const point of points) {
    const previous = output[output.length - 1]
    if (previous && Math.hypot(point[0] - previous[0], point[1] - previous[1]) < minGap) continue
    output.push([roundTo(point[0]), roundTo(point[1])])
  }
  // Always keep the true endpoint so rivers reach their mouths
  const last = points[points.length - 1]
  const kept = output[output.length - 1]
  if (last && kept && (kept[0] !== roundTo(last[0]) || kept[1] !== roundTo(last[1]))) {
    output.push([roundTo(last[0]), roundTo(last[1])])
  }
  return output
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

const pathFromRings = (rings: Point[][]): string =>
  rings
    .filter(ring => ring.length >= 3)
    .map(ring => `M ${ring.map(([x, y]) => `${x},${y}`).join(' L ')} z`)
    .join(' ')

const pathFromLines = (lines: Point[][]): string =>
  lines
    .filter(line => line.length >= 2)
    .map(line => `M ${line.map(([x, y]) => `${x},${y}`).join(' L ')}`)
    .join(' ')

/**
 * Natural Earth stores a long river as many named centerline segments that are
 * neither ordered along the flow nor touching (small breaks of a few units at
 * confluences and data seams). Emitted as-is, each becomes its own `M`-subpath
 * and SVG lifts the pen between them — the river renders as disconnected stubs,
 * and `getTotalLength()`-based draw-in animations (which assume one continuous
 * stroke) break too.
 *
 * Greedily chain the bag of segments into as few polylines as possible: from a
 * seed segment, repeatedly attach whichever remaining segment has an endpoint
 * nearest the current chain's tail (flipping that segment if its far end is
 * closer). Breaks up to `bridgeGap` are absorbed into the same subpath — the
 * straight join spans the small NE gap, which reads as continuous — and a new
 * subpath only starts when the nearest remaining endpoint is farther than that.
 */
const stitchLines = (lines: Point[][], bridgeGap: number): Point[][] => {
  const remaining = lines.filter(line => line.length >= 2).map(line => [...line])
  const chains: Point[][] = []

  while (remaining.length) {
    const chain = remaining.shift()!
    // Extend the chain forward from its tail until nothing is close enough.
    for (;;) {
      const tail = chain[chain.length - 1]
      let bestIndex = -1
      let bestDistance = Infinity
      let flip = false
      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i]
        const dStart = Math.hypot(seg[0][0] - tail[0], seg[0][1] - tail[1])
        const dEnd = Math.hypot(
          seg[seg.length - 1][0] - tail[0],
          seg[seg.length - 1][1] - tail[1]
        )
        const [d, flipped] = dStart <= dEnd ? [dStart, false] : [dEnd, true]
        if (d < bestDistance) {
          bestDistance = d
          bestIndex = i
          flip = flipped
        }
      }
      if (bestIndex === -1 || bestDistance > bridgeGap) break
      const [next] = remaining.splice(bestIndex, 1)
      const oriented = flip ? next.reverse() : next
      // Drop the duplicated joint vertex when the endpoints coincide.
      chain.push(...(bestDistance === 0 ? oriented.slice(1) : oriented))
    }
    chains.push(chain)
  }

  return chains
}

// --- Country geometry for adjacency tests -----------------------------------
interface CountryShape {
  code: ISOCountryCode
  rings: Point[][]
  bounds: [number, number, number, number]
}

const countryShapes: CountryShape[] = ISOCountryCodes.map(code => {
  const rings = parsePolygons(MAP_PATHS[code]) as Point[][]
  return { code, rings, bounds: boundsOf(rings) }
})

const inBounds = ([x, y]: Point, [bx, by, bw, bh]: [number, number, number, number], pad = 0) =>
  x >= bx - pad && x <= bx + bw + pad && y >= by - pad && y <= by + bh + pad

const pointInRings = (point: Point, rings: Point[][]): boolean => {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) {
        inside = !inside
      }
    }
  }
  return inside
}

/** Spatial hash of every country's ring vertices, for shore-proximity tests. */
const GRID = 4
const shoreGrid = new Map<string, { code: ISOCountryCode; point: Point }[]>()
for (const { code, rings } of countryShapes)
  for (const ring of rings)
    for (const point of ring) {
      const key = `${Math.floor(point[0] / GRID)}:${Math.floor(point[1] / GRID)}`
      const bucket = shoreGrid.get(key) ?? []
      bucket.push({ code, point })
      shoreGrid.set(key, bucket)
    }

const countriesNear = (points: Point[], epsilon: number): Set<ISOCountryCode> => {
  const found = new Set<ISOCountryCode>()
  for (const [x, y] of points) {
    const cellX = Math.floor(x / GRID)
    const cellY = Math.floor(y / GRID)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const { code, point } of shoreGrid.get(`${cellX + dx}:${cellY + dy}`) ?? []) {
          if (found.has(code)) continue
          if (Math.hypot(point[0] - x, point[1] - y) <= epsilon) found.add(code)
        }
      }
  }
  return found
}

const countriesContaining = (samples: Point[]): ISOCountryCode[] => {
  const ordered: ISOCountryCode[] = []
  for (const sample of samples) {
    for (const { code, rings, bounds } of countryShapes) {
      if (ordered.includes(code)) continue
      if (!inBounds(sample, bounds, 0.5)) continue
      if (pointInRings(sample, rings)) ordered.push(code)
    }
  }
  return ordered
}

/** Resample an open polyline at a fixed step for crossing tests. */
const sampleAlong = (lines: Point[][], step: number): Point[] => {
  const samples: Point[] = []
  for (const line of lines) {
    let carried = 0
    samples.push(line[0])
    for (let i = 1; i < line.length; i++) {
      const [x1, y1] = line[i - 1]
      const [x2, y2] = line[i]
      const length = Math.hypot(x2 - x1, y2 - y1)
      let travelled = step - carried
      while (travelled < length) {
        samples.push([x1 + ((x2 - x1) * travelled) / length, y1 + ((y2 - y1) * travelled) / length])
        travelled += step
      }
      carried = (length + carried) % step
    }
  }
  return samples
}

/** NE geojson exports are inconsistent about property-key casing per layer. */
const property = (properties: Record<string, unknown>, key: string): string => {
  const value = properties[key] ?? properties[key.toUpperCase()] ?? properties[key.toLowerCase()]
  return value === null || value === undefined ? '' : String(value).trim()
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

// --- Build -------------------------------------------------------------------
const features: Record<string, WaterFeature> = {}
const add = (feature: WaterFeature) => {
  // Some names repeat across the globe (two "North Channel"s) — keep the
  // one with more adjacent countries, it's the better question
  const existing = features[feature.id]
  if (existing && existing.countries.length >= feature.countries.length) return
  features[feature.id] = feature
}

const asPolygonGroups = (geometry: Polygon | MultiPolygon): Point[][][] =>
  geometry.type === 'Polygon'
    ? [(geometry.coordinates as Point[][])]
    : (geometry.coordinates as Point[][][])

const asLines = (geometry: LineString | MultiLineString): Point[][] =>
  geometry.type === 'LineString'
    ? [geometry.coordinates as Point[]]
    : (geometry.coordinates as Point[][])

const main = async () => {
  // --- Seas, gulfs, bays, straits -------------------------------------------
  const marine = await fetchLayer(LAYERS.marine)
  for (const feature of marine.features as Feature<Polygon | MultiPolygon>[]) {
    const properties = feature.properties as Record<string, unknown>
    const kind = MARINE_KINDS[property(properties, 'featurecla').toLowerCase()]
    const name = property(properties, 'name_en') || property(properties, 'name')
    if (!kind || !name) continue

    const rings = asPolygonGroups(feature.geometry)
      .flat()
      .map(ring => decimate(ring.map(project)))
      .filter(ring => ring.length >= 3)
    if (!rings.length) continue

    const shoreCountries = countriesNear(rings.flat(), SHORE_EPSILON)
    if (!shoreCountries.size) continue

    add({
      id: slugify(name),
      name,
      kind,
      d: pathFromRings(rings),
      bounds: boundsOf(rings),
      countries: [...shoreCountries].sort(),
    })
  }

  // --- Lakes ------------------------------------------------------------------
  const lakes = await fetchLayer(LAYERS.lakes)
  for (const feature of lakes.features as Feature<Polygon | MultiPolygon>[]) {
    const properties = feature.properties as Record<string, unknown>
    const name = property(properties, 'name_en') || property(properties, 'name')
    const scalerank = Number(property(properties, 'scalerank') || 99)
    if (!name || scalerank > 3) continue

    const rings = asPolygonGroups(feature.geometry)
      .flat()
      .map(ring => decimate(ring.map(project), 0.4))
      .filter(ring => ring.length >= 3)
    if (!rings.length) continue

    const shoreCountries = countriesNear(rings.flat(), SHORE_EPSILON)
    if (!shoreCountries.size) continue

    add({
      id: `lake-${slugify(name)}`,
      name,
      kind: 'lake',
      d: pathFromRings(rings),
      bounds: boundsOf(rings),
      countries: [...shoreCountries].sort(),
    })
  }

  // --- Rivers: merge segments by name ----------------------------------------
  const rivers = await fetchLayer(LAYERS.rivers)
  const riverSegments = new Map<string, Point[][]>()
  for (const feature of rivers.features as Feature<LineString | MultiLineString>[]) {
    const properties = feature.properties as Record<string, unknown>
    const name = property(properties, 'name_en') || property(properties, 'name')
    if (!name || property(properties, 'featurecla').includes('Lake')) continue
    const projected = asLines(feature.geometry).map(line => decimate(line.map(project), 0.5))
    const bucket = riverSegments.get(name) ?? []
    bucket.push(...projected.filter(line => line.length >= 2))
    riverSegments.set(name, bucket)
  }

  for (const [name, lines] of riverSegments) {
    if (!lines.length) continue

    // River names collide globally (two Moravas, two Colorados, several
    // Negros) — segments sharing a name are only the same river if they're
    // geographically connected. Cluster by proximity and keep the longest
    // cluster; a question naming two rivers at once is unanswerable.
    const CLUSTER_GAP = 12
    const clusters: Point[][][] = []
    for (const line of lines) {
      const [lx, ly, lw, lh] = boundsOf([line])
      const near = clusters.filter(cluster =>
        cluster.some(member => {
          const [mx, my, mw, mh] = boundsOf([member])
          return (
            lx - CLUSTER_GAP < mx + mw &&
            mx - CLUSTER_GAP < lx + lw &&
            ly - CLUSTER_GAP < my + mh &&
            my - CLUSTER_GAP < ly + lh
          )
        })
      )
      if (!near.length) {
        clusters.push([line])
        continue
      }
      // The new segment may bridge several clusters — merge them all
      near[0].push(line)
      for (const other of near.slice(1)) {
        near[0].push(...other)
        clusters.splice(clusters.indexOf(other), 1)
      }
    }

    const lengthOf = (cluster: Point[][]) => {
      let total = 0
      for (const line of cluster)
        for (let i = 1; i < line.length; i++)
          total += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])
      return total
    }
    const main = clusters.reduce((a, b) => (lengthOf(a) >= lengthOf(b) ? a : b))
    if (lengthOf(main) < MIN_RIVER_LENGTH) continue

    // Chain the cluster's segments into flow order and bridge the small NE
    // breaks, so the river draws as one continuous stroke (and `sampleAlong`
    // walks it in order). Segments the clustering already tied together sit
    // within CLUSTER_GAP, so reuse it as the bridge threshold.
    const stitched = stitchLines(main, CLUSTER_GAP)

    const crossed = countriesContaining(sampleAlong(stitched, RIVER_SAMPLE_STEP))
    if (!crossed.length) continue

    add({
      id: `river-${slugify(name)}`,
      name,
      kind: 'river',
      d: pathFromLines(stitched),
      bounds: boundsOf(stitched),
      countries: crossed,
    })
  }

  // --- Ranges, deserts, plateaus ---------------------------------------------
  const regions = await fetchLayer(LAYERS.regions)
  for (const feature of regions.features as Feature<Polygon | MultiPolygon>[]) {
    const properties = feature.properties as Record<string, unknown>
    const kind = REGION_KINDS[property(properties, 'featurecla')]
    const name = property(properties, 'name_en') || property(properties, 'name')
    if (!kind || !name) continue

    const rings = asPolygonGroups(feature.geometry)
      .flat()
      .map(ring => decimate(ring.map(project)))
      .filter(ring => ring.length >= 3)
    if (!rings.length) continue

    // Hosts: countries whose territory the region actually overlaps
    const hosts = countriesContaining(sampleAlong(rings, 2.5)).filter(code => {
      void code
      return true
    })
    const nearby = countriesNear(rings.flat(), 1.2)
    const countries = [...new Set([...hosts, ...nearby])].sort()
    if (!countries.length) continue

    add({
      id: `${kind}-${slugify(name)}`,
      name,
      kind,
      d: pathFromRings(rings),
      bounds: boundsOf(rings),
      countries,
    })
  }

  // --- Emit --------------------------------------------------------------------
  const sorted = Object.fromEntries(Object.entries(features).sort(([a], [b]) => a.localeCompare(b)))
  const output = `// Generated by generators/vendors/naturalearth/create-water.ts — do not edit by hand.
// Source: Natural Earth 1:10m physical layers (${NE_TAG}, public domain),
// projected with the map's fitted Robinson (see data/map.gen.ts).
import type { ISOCountryCode } from '~~/types/geography.types'

export type WaterKind = 'sea' | 'lake' | 'river' | 'range' | 'desert' | 'plateau'

export interface WaterFeature {
  id: string
  name: string
  kind: WaterKind
  /** Projected path in map space: closed rings for areas, open polylines for rivers. */
  d: string
  bounds: [number, number, number, number]
  /** Playable countries the feature touches/crosses (rivers: in order of appearance). */
  countries: ISOCountryCode[]
}

export const WATER_FEATURES: Record<string, WaterFeature> = ${JSON.stringify(sorted)}
`
  writeFileSync(OUT_FILE, output)

  const byKind = new Map<string, number>()
  for (const feature of Object.values(features)) {
    byKind.set(feature.kind, (byKind.get(feature.kind) ?? 0) + 1)
  }
  console.info(`Features: ${[...byKind.entries()].map(([kind, count]) => `${kind}:${count}`).join(' ')}`)
  const bytes = Buffer.byteLength(output)
  console.info(`Output: ${(bytes / 1024).toFixed(0)} KB raw, ${(Bun.gzipSync(Buffer.from(output)).byteLength / 1024).toFixed(0)} KB gzip → ${OUT_FILE}`)

  // Sanity spot-checks against well-known geography
  for (const id of ['river-danube', 'black-sea', 'lake-lake-victoria', 'range-alps']) {
    const feature = Object.values(features).find(f => f.id === id || f.id.includes(id.replace(/^(river|lake|range)-/, '')))
    console.info(`${id}: ${feature ? `${feature.name} → ${feature.countries.join(' ')}` : 'NOT FOUND'}`)
  }
}

await main()
