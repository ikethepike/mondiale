/**
 * Generates data/map.gen.ts — the gameplay world-map geometry — from
 * Natural Earth 1:10m admin_0_map_units (public domain), replacing the
 * hand-authored low-poly paths that used to live inline in GameMap.vue.
 *
 * The legacy map is a Robinson projection cropped into viewBox 0 0 2000 1001.
 * We fit the same projection against anchor coordinates measured from the
 * legacy paths so every camera constant and threshold keeps working.
 *
 * Output paths are pure move/line/close commands — lib/outline.ts
 * parsePolygons drops anything else.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { geoRobinson } from 'd3-geo-projection'
import { topology } from 'topojson-server'
import { presimplify, quantile, simplify } from 'topojson-simplify'
import { merge } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import { parsePolygons } from '../../../lib/outline'
import { ISOCountryCodes } from '../../../data/iso-codes.gen'

const NE_TAG = 'v5.1.2'
const NE_FILE = 'ne_10m_admin_0_map_units'
const NE_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_TAG}/geojson/${NE_FILE}.geojson`
const CACHE_DIR = `${import.meta.dir}/.cache`
const CACHE_FILE = `${CACHE_DIR}/${NE_FILE}.geojson`
const OUT_FILE = 'data/map.gen.ts'
const OUT_HD_FILE = 'data/map-hd.gen.ts'

/** Fraction of topology points to retain after Visvalingam simplification. */
/**
 * Two detail tiers: the base tier is what ships in the main map chunk and is
 * everything a world-zoom view needs; the HD tier lives in its own lazy chunk
 * and is swapped into countries inside the camera frame once zoomed in.
 */
const RETAIN_BASE = 0.06
const RETAIN_HD = 0.25
/** Projected-area floor (viewBox units²) below which islet rings are dropped. */
const MIN_RING_AREA_LARGE = 0.05
const MIN_RING_AREA_SMALL = 0.002
/** Countries with a projected footprint below this get dot markers in the UI. */
const MICRO_FOOTPRINT = 1.5

/**
 * Territories drawn on the map that are not (yet) playable countries.
 * Mirrors the legacy map's dependency set. XK stays here until Kosovo
 * joins ISOCountryCodes, at which point it moves over automatically.
 */
const TERRITORY_CODES = [
  'AI', 'AW', 'BM', 'CW', 'EH', 'FK', 'FO', 'GF', 'GL', 'GP', 'IC', 'KY',
  'MQ', 'MS', 'NC', 'PF', 'PN', 'PR', 'RE', 'SX', 'TC', 'VC', 'VG', 'VI',
  'YT', 'XK',
]

/** NE units with ISO_A2 = -99 that belong to a host country's shape. */
const UNIT_OVERRIDES: Record<string, string> = {
  KOS: 'XK', // Kosovo (belt & suspenders; ISO_A2_EH already says XK)
  SOL: 'SO', // Somaliland — NE splits it out; without it Somalia has a hole
  CYN: 'CY', // Northern Cyprus
  ESB: 'CY', // Dhekelia (UK base)
  WSB: 'CY', // Akrotiri (UK base)
  CNM: 'CY', // Cyprus UN buffer zone
  KNX: 'KR', // Korean DMZ (south)
  KNZ: 'KP', // Korean DMZ (north)
  USG: 'CU', // Guantanamo Bay
  KAS: 'IN', // Siachen Glacier
  SPI: 'CL', // Southern Patagonian Ice Field
  BRT: 'EG', // Bir Tawil
}

/**
 * Far-flung specks and non-places. Merging these into their sovereign would
 * explode its bounding box (Wake Atoll alone would stretch the US across the
 * Pacific and break camera framing), and the reefs are disputed non-answers.
 */
const DROP_UNITS = new Set([
  'CLP', // Clipperton I. (FR)
  'CSI', 'ATC', // Coral Sea Is., Ashmore & Cartier (AU)
  'BRI', // Brazilian I. (disputed BR/UY islet)
  'KAB', // Baikonur (KZ lease)
  'NJM', // Jan Mayen (NO)
  'JQI', 'DQI', 'FQI', 'HQI', 'WQI', 'MQI', 'BQI', 'LQI', 'KQI', // US minor outlying
  'PFA', 'PGA', 'BJN', 'SER', 'SCR', // Paracel/Spratly/Caribbean banks/Scarborough
])

/**
 * Projection anchors: bbox centers of compact island nations measured from
 * the legacy GameMap.vue paths. Robinson scale/translate are least-squares
 * fitted so the new map lands exactly on the old coordinate space.
 */
const LEGACY_ANCHORS: Record<string, [number, number]> = {
  SG: [1560.2, 563.5],
  BB: [644.7, 488.3],
  NR: [1914.9, 575.5],
  MT: [1052.5, 343.4],
  CY: [1153.5, 348.7],
  JM: [548.8, 456.9],
  MU: [1294.3, 701.0],
  TT: [634.5, 504.1],
  ST: [1015.9, 566.6],
  KM: [1221.7, 647.7],
  BN: [1621.1, 542.1],
  CV: [843.4, 470.4],
}

type UnitProps = { code: string }
type Ring = [number, number][]

const fetchSource = async (): Promise<FeatureCollection> => {
  if (!existsSync(CACHE_FILE)) {
    console.info(`Downloading ${NE_URL}`)
    const response = await fetch(NE_URL)
    if (!response.ok) throw new Error(`Natural Earth download failed: ${response.status}`)
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(CACHE_FILE, await response.text())
  }
  return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'))
}

const resolveCode = (properties: Record<string, unknown>): string | undefined => {
  const unit = String(properties.GU_A3 ?? properties.ADM0_A3)
  if (DROP_UNITS.has(unit)) return undefined
  const override = UNIT_OVERRIDES[unit]
  if (override) return override
  for (const field of ['ISO_A2_EH', 'ISO_A2']) {
    const value = String(properties[field])
    if (/^[A-Z]{2}$/.test(value)) return value
  }
  throw new Error(`Unresolvable NE unit: ${properties.NAME} (${unit})`)
}

const ringArea = (ring: Ring): number => {
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    area += x1 * y2 - x2 * y1
  }
  return area / 2
}

const geoBounds = (polygons: Ring[][]): [number, number, number, number] => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const polygon of polygons)
    for (const ring of polygon)
      for (const [x, y] of ring) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
  return [minX, minY, maxX - minX, maxY - minY]
}

const asPolygons = (geometry: Polygon | MultiPolygon): Ring[][] =>
  geometry.type === 'Polygon'
    ? [geometry.coordinates as Ring[]]
    : (geometry.coordinates as Ring[][])

const main = async () => {
  const source = await fetchSource()

  const gameCodes = new Set<string>(ISOCountryCodes)
  const keepCodes = new Set<string>([...gameCodes, ...TERRITORY_CODES])
  const extraCodes = TERRITORY_CODES.filter(code => !gameCodes.has(code)).sort()

  // --- Resolve unit codes, drop the unwanted, tag survivors -----------------
  const units: Feature<Polygon | MultiPolygon, UnitProps>[] = []
  for (const feature of source.features) {
    const code = resolveCode(feature.properties as Record<string, unknown>)
    if (!code || !keepCodes.has(code)) continue
    units.push({
      type: 'Feature',
      properties: { code },
      geometry: feature.geometry as Polygon | MultiPolygon,
    })
  }

  // --- Shared-arc topology, then topology-preserving simplification ---------
  type UnitTopology = Topology<{ units: GeometryCollection<UnitProps> }>
  const topo = topology(
    { units: { type: 'FeatureCollection', features: units } as never },
    1e7
  ) as UnitTopology
  const weighted = presimplify(topo)
  // quantile is retention-oriented: simplify(t, quantile(t, p)) keeps ~p·n points
  const simplifiedBase = simplify(weighted, quantile(weighted, RETAIN_BASE)) as UnitTopology
  const simplifiedHd = simplify(weighted, quantile(weighted, RETAIN_HD)) as UnitTopology

  const geometriesFor = (from: UnitTopology, code: string) =>
    from.objects.units.geometries.filter(
      geometry => (geometry.properties as UnitProps | undefined)?.code === code
    ) as Parameters<typeof merge>[1]
  const mergeCode = (from: UnitTopology, code: string) => merge(from, geometriesFor(from, code))

  // --- Projection: Robinson fitted to the legacy coordinate space -----------
  const base = geoRobinson().scale(1).translate([0, 0])
  const anchorPairs = Object.entries(LEGACY_ANCHORS).map(([code, legacy]) => {
    const merged = mergeCode(topo, code)
    const [minLon, minLat, width, height] = geoBounds(asPolygons(merged))
    const projected = base([minLon + width / 2, minLat + height / 2])
    if (!projected) throw new Error(`Anchor ${code} failed to project`)
    return { code, legacy, unit: projected }
  })
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length
  const fit = (pairs: typeof anchorPairs) => {
    const unitMeanX = mean(pairs.map(a => a.unit[0]))
    const unitMeanY = mean(pairs.map(a => a.unit[1]))
    const legacyMeanX = mean(pairs.map(a => a.legacy[0]))
    const legacyMeanY = mean(pairs.map(a => a.legacy[1]))
    let dotProduct = 0
    let unitNorm = 0
    for (const { unit, legacy } of pairs) {
      const du = [unit[0] - unitMeanX, unit[1] - unitMeanY]
      const dl = [legacy[0] - legacyMeanX, legacy[1] - legacyMeanY]
      dotProduct += du[0] * dl[0] + du[1] * dl[1]
      unitNorm += du[0] * du[0] + du[1] * du[1]
    }
    const scale = dotProduct / unitNorm
    const translate: [number, number] = [legacyMeanX - scale * unitMeanX, legacyMeanY - scale * unitMeanY]
    const residuals = pairs.map(({ unit, legacy }) =>
      Math.hypot(scale * unit[0] + translate[0] - legacy[0], scale * unit[1] + translate[1] - legacy[1])
    )
    return { scale, translate, residuals }
  }

  // Legacy anchors are hand-drawn; one pass of outlier rejection guards
  // against archipelagos whose NE extent differs from the drawn main island.
  const firstPass = fit(anchorPairs)
  const medianResidual = [...firstPass.residuals].sort((a, b) => a - b)[Math.floor(anchorPairs.length / 2)]
  const inliers = anchorPairs.filter((_, i) => firstPass.residuals[i] <= Math.max(2.5 * medianResidual, 3))
  for (const pair of anchorPairs)
    if (!inliers.includes(pair)) console.info(`anchor ${pair.code}: rejected as outlier`)
  const { scale, translate, residuals } = fit(inliers)
  const projection = geoRobinson().scale(scale).translate(translate)

  inliers.forEach(({ code }, i) => console.info(`anchor ${code}: residual ${residuals[i].toFixed(2)}`))
  const rms = Math.sqrt(mean(residuals.map(r => r ** 2)))
  console.info(
    `Robinson fit: scale ${scale.toFixed(2)}, translate [${translate[0].toFixed(1)}, ${translate[1].toFixed(1)}], RMS ${rms.toFixed(2)}`
  )
  if (rms > 3) throw new Error(`Projection fit RMS ${rms.toFixed(2)} exceeds tolerance — anchors disagree`)

  // --- Project, filter rings, emit paths ------------------------------------
  const project = (ring: Ring): Ring =>
    ring.map(([lon, lat]) => projection([lon, lat]) as [number, number])

  /** Projected footprint per code from the unsimplified topology. */
  const footprints = new Map<string, number>()
  const projectedBoundsByCode = new Map<string, Ring[][]>()
  for (const code of keepCodes) {
    const geometries = geometriesFor(topo, code)
    if (!(geometries as unknown[]).length) continue
    const projected = asPolygons(merge(topo, geometries)).map(polygon => polygon.map(project))
    projectedBoundsByCode.set(code, projected)
    const [, , width, height] = geoBounds(projected)
    footprints.set(code, Math.max(width, height))
  }

  const roundTo = (value: number, decimals: number) => Number(value.toFixed(decimals))

  const emitPath = (polygons: Ring[][], decimals: number, minRingArea: number, keepLargestOf: Ring): string => {
    const parts: string[] = []
    for (const polygon of polygons) {
      for (const ring of polygon) {
        if (Math.abs(ringArea(ring)) < minRingArea && ring !== keepLargestOf) continue
        const rounded: Ring = []
        for (const [x, y] of ring) {
          const point: [number, number] = [roundTo(x, decimals), roundTo(y, decimals)]
          const previous = rounded[rounded.length - 1]
          if (previous && previous[0] === point[0] && previous[1] === point[1]) continue
          rounded.push(point)
        }
        const [firstX, firstY] = rounded[0]
        const last = rounded[rounded.length - 1]
        if (rounded.length > 1 && last[0] === firstX && last[1] === firstY) rounded.pop()
        if (new Set(rounded.map(([x, y]) => `${x},${y}`)).size < 3) {
          if (ring !== keepLargestOf) continue
          throw new Error('Largest ring degenerated — raise precision')
        }
        const deltas: string[] = []
        for (let i = 1; i < rounded.length; i++) {
          const dx = roundTo(rounded[i][0] - rounded[i - 1][0], decimals)
          const dy = roundTo(rounded[i][1] - rounded[i - 1][1], decimals)
          deltas.push(`${dx},${dy}`)
        }
        parts.push(`M ${firstX},${firstY} l ${deltas.join(' ')} z`)
      }
    }
    return parts.join(' ')
  }

  const buildPaths = (tier: UnitTopology, tierName: string): Record<string, string> => {
    const paths: Record<string, string> = {}
    const missing: string[] = []
    for (const code of [...keepCodes].sort()) {
      if (code === 'IC') continue // synthesized from ES below
      const hasUnits = (geometriesFor(topo, code) as unknown[]).length > 0
      if (!hasUnits) {
        missing.push(code)
        continue
      }
      // No blanket micro-protection: a country simplified differently from
      // its neighbours gets seams — parallel "double borders" along shared
      // edges (Liechtenstein vs CH/AT). Everyone shares the tier's arcs; the
      // degenerate-collapse fallback below still rescues the truly tiny, and
      // those are islands or sub-pixel enclaves where no seam can show.
      const footprint = footprints.get(code) ?? 0
      const sourceTopo = tier
      let polygons = asPolygons(mergeCode(sourceTopo, code)).map(polygon => polygon.map(project))

      // Canary Islands carve-out: NE has no IC unit; split it off Spain.
      if (code === 'ES') {
        const geographic = asPolygons(mergeCode(sourceTopo, 'ES'))
        const isCanary = (polygon: Ring[]) => {
          const [minLon, minLat, width, height] = geoBounds([polygon])
          const lon = minLon + width / 2
          const lat = minLat + height / 2
          return lon >= -18.6 && lon <= -13.3 && lat >= 27.3 && lat <= 29.6
        }
        const canaries = geographic.filter(isCanary)
        if (!canaries.length) throw new Error('Canary Islands carve-out found nothing')
        polygons = geographic.filter(p => !isCanary(p)).map(polygon => polygon.map(project))
        const canaryProjected = canaries.map(polygon => polygon.map(project))
        const canaryFootprint = Math.max(...geoBounds(canaryProjected).slice(2))
        footprints.set('IC', canaryFootprint)
        const canaryRings = canaryProjected.flat()
        const canaryLargest = canaryRings.reduce((a, b) => (Math.abs(ringArea(a)) >= Math.abs(ringArea(b)) ? a : b))
        paths.IC = emitPath(canaryProjected, 3, MIN_RING_AREA_SMALL, canaryLargest)
      }

      // UNIFORM precision: neighbours sharing an arc must round it onto the
      // same grid or hairline slivers open along their border. Only rings
      // that degenerate at 2 decimals (sub-pixel enclaves like VA) escalate.
      const minRingArea = footprint >= 5 ? MIN_RING_AREA_LARGE : MIN_RING_AREA_SMALL
      const emitFrom = (source: Ring[][], decimals: number) => {
        const largest = source
          .flat()
          .reduce((a, b) => (Math.abs(ringArea(a)) >= Math.abs(ringArea(b)) ? a : b))
        return emitPath(source, decimals, minRingArea, largest)
      }
      const attempts: [Ring[][], number][] = [
        [polygons, 2],
        [polygons, 4],
        [asPolygons(mergeCode(topo, code)).map(polygon => polygon.map(project)), 4],
      ]
      for (const [source, decimals] of attempts) {
        try {
          paths[code] = emitFrom(source, decimals)
          break
        } catch {
          console.info(`${code} (${tierName}): degenerate at ${decimals} decimals, escalating`)
        }
      }
      if (!paths[code]) throw new Error(`${code} (${tierName}): all emission attempts degenerated`)
    }
    if (missing.length) throw new Error(`No NE geometry for: ${missing.join(', ')}`)
    return paths
  }

  const mapPaths = buildPaths(simplifiedBase, 'base')
  const mapPathsHd = buildPaths(simplifiedHd, 'hd')

  // --- Validate against the outline parser the game actually uses -----------
  const bounds: Record<string, [number, number, number, number]> = {}
  const regions: Record<string, [number, number, number, number][]> = {}
  const micro: Record<string, { x: number; y: number; footprint: number }> = {}
  let vertexTotal = 0
  const vertexCounts: [string, number][] = []
  for (const [code, d] of Object.entries(mapPaths)) {
    const rings = parsePolygons(d)
    if (!rings.length) throw new Error(`Emitted path for ${code} does not parse to any ring`)
    const [x, y, width, height] = geoBounds([rings])
    bounds[code] = [roundTo(x, 2), roundTo(y, 2), roundTo(width, 2), roundTo(height, 2)]

    // Per-ring boxes for visibility tests: a whole-country bbox lies for
    // RU/US-class countries (antimeridian fragments stretch it across the
    // map), which would drag their huge HD geometry into every view.
    const ringBoxes = rings
      .map(ring => ({ box: geoBounds([[ring]]), area: Math.abs(ringArea(ring)) }))
      .sort((a, b) => b.area - a.area)
      .slice(0, 8)
      .map(({ box: [bx, by, bw, bh] }): [number, number, number, number] => [
        Math.floor(bx),
        Math.floor(by),
        Math.ceil(bw) + 1,
        Math.ceil(bh) + 1,
      ])
    regions[code] = ringBoxes

    const vertices = rings.reduce((total, ring) => total + ring.length, 0)
    vertexTotal += vertices
    vertexCounts.push([code, vertices])
    const footprint = Math.max(width, height)
    if (footprint < MICRO_FOOTPRINT && gameCodes.has(code))
      micro[code] = { x: roundTo(x + width / 2, 2), y: roundTo(y + height / 2, 2), footprint: roundTo(footprint, 3) }
  }

  for (const code of gameCodes)
    if (!mapPaths[code]) throw new Error(`Game country ${code} missing from emitted map`)

  let hdVertexTotal = 0
  for (const [code, d] of Object.entries(mapPathsHd)) {
    const rings = parsePolygons(d)
    if (!rings.length) throw new Error(`HD path for ${code} does not parse to any ring`)
    hdVertexTotal += rings.reduce((total, ring) => total + ring.length, 0)
  }
  if (Object.keys(mapPathsHd).length !== Object.keys(mapPaths).length)
    throw new Error('Base and HD tiers cover different country sets')

  // --- Emit ------------------------------------------------------------------
  const sortedEntries = <T>(record: Record<string, T>) =>
    Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)))

  const output = `// Generated by generators/vendors/naturalearth/create-map.ts — do not edit by hand.
// Source: Natural Earth 1:10m admin_0_map_units (${NE_TAG}, public domain).
// Robinson projection fitted to the legacy 0 0 2000 1001 coordinate space.
import type { ISOCountryCode } from '~~/types/geography.types'

export const EXTRA_MAP_CODES = ${JSON.stringify(extraCodes)} as const

export type MapCode = ISOCountryCode | (typeof EXTRA_MAP_CODES)[number]

export const MAP_VIEWBOX = '0 0 2000 1001'

/**
 * The fitted Robinson parameters — other generators (water features, any
 * future Natural Earth layer) project into the same coordinate space with
 * geoRobinson().scale(scale).translate(translate).
 */
export const MAP_PROJECTION = { scale: ${roundTo(scale, 6)}, translate: [${roundTo(translate[0], 4)}, ${roundTo(translate[1], 4)}] as [number, number] }

export const MAP_PATHS = ${JSON.stringify(sortedEntries(mapPaths))} as Record<MapCode, string>

/** Projected bounding box per country: [x, y, width, height]. */
export const MAP_BOUNDS = ${JSON.stringify(sortedEntries(bounds))} as Record<MapCode, [number, number, number, number]>

/**
 * Boxes of a country's largest rings (up to 8), for visibility testing.
 * The whole-country bbox overstates RU/US-class countries whose islands wrap
 * the antimeridian — use these to decide what is actually in view.
 */
export const MAP_REGIONS = ${JSON.stringify(sortedEntries(regions))} as Record<MapCode, [number, number, number, number][]>

/** Game countries too small to see or click at world zoom — rendered as dot markers. */
export const MICRO_COUNTRIES = ${JSON.stringify(sortedEntries(micro))} as Partial<Record<MapCode, { x: number; y: number; footprint: number }>>
`
  writeFileSync(OUT_FILE, output)

  const hdOutput = `// Generated by generators/vendors/naturalearth/create-map.ts — do not edit by hand.
// High-detail tier (retention ${RETAIN_HD}): lazy-loaded by GameMap and swapped
// into the countries inside the camera frame once zoomed past the LOD threshold.
import type { MapCode } from './map.gen'

export const MAP_PATHS_HD = ${JSON.stringify(sortedEntries(mapPathsHd))} as Record<MapCode, string>
`
  writeFileSync(OUT_HD_FILE, hdOutput)

  // --- Stats -------------------------------------------------------------------
  vertexCounts.sort((a, b) => b[1] - a[1])
  console.info(`\nTop vertex counts: ${vertexCounts.slice(0, 20).map(([c, n]) => `${c}:${n}`).join(' ')}`)
  console.info(`Total vertices: base ${vertexTotal}, hd ${hdVertexTotal}`)
  console.info(`Micro countries (${Object.keys(micro).length}): ${Object.keys(micro).sort().join(' ')}`)
  for (const [file, content] of [[OUT_FILE, output], [OUT_HD_FILE, hdOutput]] as const) {
    const bytes = Buffer.byteLength(content)
    const gzipped = Bun.gzipSync(Buffer.from(content)).byteLength
    console.info(`Output: ${(bytes / 1024).toFixed(0)} KB raw, ${(gzipped / 1024).toFixed(0)} KB gzip → ${file}`)
  }
}

await main()
