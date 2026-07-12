import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BORDERS } from '../data/borders.gen'
import { ISOCountryCodes } from '../data/iso-codes.gen'
import type { ISOCountryCode } from '../types/geography.types'
import { STRAIT_ADDITIONS, STRAIT_EXCLUSIONS } from './data/strait-overrides'
import { loadCountryShapes } from './vendors/naturalearth/country-shapes'

/**
 * Sea adjacency between the game's countries: every pair whose coastlines sit
 * within MAX_STRAIT_KM of each other AND whose crossing is genuinely theirs —
 * sampled along the shortest crossing, no point may lie inside a third game
 * country or nearer to one's boundary than to both endpoints (a Voronoi
 * approximation of median-line maritime boundaries). Distance alone is not
 * enough: Pakistan–Tajikistan sit 18 km apart across Afghan land, and
 * Albania–Croatia face each other only across Montenegro's median line.
 *
 * Powers Border Chain's strait hops (CN–TW, DK–SE, RU–US Bering…). Deliberately
 * a separate file from BORDERS — neighbour-blitz and traversal gate on land
 * adjacency and must never see sea edges. Countries not in the game (Western
 * Sahara precedent in create-borders-file) don't block a crossing.
 *
 * Pairs closer than MIN_STRAIT_KM share border vertices, i.e. they touch on
 * land: each is either already in BORDERS or editorially excluded there, and a
 * strait must not resurrect it.
 *
 * Editorial corrections live in generators/data/strait-overrides.ts; every
 * kept and dropped edge lands in generators/data/straits-report.txt for review.
 *
 *   bun run generate:straits
 */

const MAX_STRAIT_KM = 150
const MIN_STRAIT_KM = 0.5
const CROSSING_SAMPLES = 24
/** Grid cell size for the neighbourhood scans. A 3×3 block must out-reach
 *  MAX_STRAIT_KM: 2° ≈ 222 km per cell along a meridian. */
const CELL_DEGREES = 2
const KM_PER_DEGREE = 111.32

const gameCodes = new Set<string>(ISOCountryCodes)
const shapes = await loadCountryShapes()

const isoList = ISOCountryCodes.filter(isoCode => shapes.has(isoCode))
const missing = ISOCountryCodes.filter(isoCode => !shapes.has(isoCode))
if (missing.length) console.warn(`No Natural Earth polygons for: ${missing.join(' ')}`)

// --- 1. Bucket every boundary vertex into a lat/lng grid ---------------------
console.log(`Bucketing boundary vertices for ${isoList.length} countries…`)
const lngs: number[] = []
const lats: number[] = []
const isoIndexOf: number[] = []
const grid = new Map<number, number[]>()

const COLUMNS = Math.ceil(360 / CELL_DEGREES)
const ROWS = Math.ceil(180 / CELL_DEGREES)
const cellOf = (lat: number, lng: number): number => {
  const row = Math.max(0, Math.min(ROWS - 1, Math.floor((lat + 90) / CELL_DEGREES)))
  const column = ((Math.floor((lng + 180) / CELL_DEGREES) % COLUMNS) + COLUMNS) % COLUMNS
  return row * COLUMNS + column
}

for (let index = 0; index < isoList.length; index++) {
  for (const [lng, lat] of shapes.boundaryVertices(isoList[index])) {
    const vertex = lngs.length
    lngs.push(lng)
    lats.push(lat)
    isoIndexOf.push(index)
    const cell = cellOf(lat, lng)
    const bucket = grid.get(cell)
    if (bucket) bucket.push(vertex)
    else grid.set(cell, [vertex])
  }
}
console.log(`  ${lngs.length} vertices in ${grid.size} cells`)

const kmBetweenPoints = (latA: number, lngA: number, latB: number, lngB: number): number => {
  const deltaLat = latA - latB
  let deltaLng = lngA - lngB
  if (deltaLng > 180) deltaLng -= 360
  if (deltaLng < -180) deltaLng += 360
  deltaLng *= Math.cos(((latA + latB) / 2) * (Math.PI / 180))
  return KM_PER_DEGREE * Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng)
}

// --- 2. Candidate crossings per pair, via 3×3 cell neighbourhoods ------------
// The nearest crossing alone is not enough: Croatia–Italy's nearest gap is at
// Trieste (Slovenian waters), while their real crossing is mid-Adriatic. Keep
// the locally best crossing per 1° region so a pair survives a blocked gap.
interface Crossing {
  from: number
  to: number
  km: number
}
const pairKey = (a: number, b: number) => (a < b ? a * isoList.length + b : b * isoList.length + a)
const nearestKm = new Map<number, number>()
const crossingsOf = new Map<number, Map<number, Crossing>>()
/** Pairs proven to touch on land — no further comparisons needed. */
const touching = new Set<number>()

const regionOf = (vertex: number): number =>
  (Math.floor(lats[vertex]) + 90) * 360 + ((Math.floor(lngs[vertex]) + 360) % 360)

const compareBuckets = (own: number[], other: number[], sameBucket: boolean) => {
  for (let i = 0; i < own.length; i++) {
    const a = own[i]
    for (let j = sameBucket ? i + 1 : 0; j < other.length; j++) {
      const b = other[j]
      if (isoIndexOf[a] === isoIndexOf[b]) continue
      const key = pairKey(isoIndexOf[a], isoIndexOf[b])
      if (touching.has(key)) continue
      const km = kmBetweenPoints(lats[a], lngs[a], lats[b], lngs[b])
      const best = nearestKm.get(key)
      if (best === undefined || km < best) {
        nearestKm.set(key, km)
        if (km < MIN_STRAIT_KM) {
          touching.add(key)
          crossingsOf.delete(key)
          continue
        }
      }
      if (km > MAX_STRAIT_KM) continue
      const anchor = isoIndexOf[a] < isoIndexOf[b] ? a : b
      const region = regionOf(anchor)
      let regions = crossingsOf.get(key)
      if (!regions) crossingsOf.set(key, (regions = new Map()))
      const localBest = regions.get(region)
      if (!localBest || km < localBest.km) regions.set(region, { from: a, to: b, km })
    }
  }
}

console.log('Scanning cell neighbourhoods for cross-country distances…')
for (const [cell, bucket] of grid) {
  const row = Math.floor(cell / COLUMNS)
  const column = cell % COLUMNS
  for (let rowShift = -1; rowShift <= 1; rowShift++) {
    const neighbourRow = row + rowShift
    if (neighbourRow < 0 || neighbourRow >= ROWS) continue
    for (let columnShift = -1; columnShift <= 1; columnShift++) {
      const neighbourCell = neighbourRow * COLUMNS + ((column + columnShift + COLUMNS) % COLUMNS)
      // Each unordered cell pair once; the same cell compares against itself.
      if (neighbourCell < cell) continue
      const neighbourBucket = grid.get(neighbourCell)
      if (!neighbourBucket) continue
      compareBuckets(bucket, neighbourBucket, neighbourCell === cell)
    }
  }
}

// --- 3. Water-crossing validation ---------------------------------------------
/** Per-country nearest-boundary km around a point, from the 3×3 neighbourhood. */
const boundaryDistancesAround = (lat: number, lng: number): Map<number, number> => {
  const distances = new Map<number, number>()
  const cell = cellOf(lat, lng)
  const row = Math.floor(cell / COLUMNS)
  const column = cell % COLUMNS
  for (let rowShift = -1; rowShift <= 1; rowShift++) {
    const neighbourRow = row + rowShift
    if (neighbourRow < 0 || neighbourRow >= ROWS) continue
    for (let columnShift = -1; columnShift <= 1; columnShift++) {
      const bucket = grid.get(neighbourRow * COLUMNS + ((column + columnShift + COLUMNS) % COLUMNS))
      if (!bucket) continue
      for (const vertex of bucket) {
        const km = kmBetweenPoints(lat, lng, lats[vertex], lngs[vertex])
        const iso = isoIndexOf[vertex]
        const best = distances.get(iso)
        if (best === undefined || km < best) distances.set(iso, km)
      }
    }
  }
  return distances
}

/** The game country a crossing wrongly runs through/past, if any. */
const crossingBlockedBy = (
  { from, to }: Crossing,
  a: number,
  b: number
): ISOCountryCode | undefined => {
  const latFrom = lats[from]
  const latTo = lats[to]
  const lngFrom = lngs[from]
  let lngTo = lngs[to]
  if (lngTo - lngFrom > 180) lngTo -= 360
  if (lngTo - lngFrom < -180) lngTo += 360

  for (let step = 0; step < CROSSING_SAMPLES; step++) {
    const t = (step + 0.5) / CROSSING_SAMPLES
    const lat = latFrom + (latTo - latFrom) * t
    let lng = lngFrom + (lngTo - lngFrom) * t
    if (lng > 180) lng -= 360
    if (lng < -180) lng += 360

    const distances = boundaryDistancesAround(lat, lng)
    const dOwn = Math.min(distances.get(a) ?? Infinity, distances.get(b) ?? Infinity)
    for (const [iso, km] of distances) {
      if (iso === a || iso === b) continue
      if (km < dOwn || shapes.contains(isoList[iso], lat, lng)) return isoList[iso]
    }
  }
  return undefined
}

// --- 4. Assemble edges: threshold + land filter + crossing test + overrides --
type Pair = [ISOCountryCode, ISOCountryCode]
const isLandBorder = (a: ISOCountryCode, b: ISOCountryCode) => BORDERS[a]?.includes(b) ?? false
const sortedPair = (a: ISOCountryCode, b: ISOCountryCode): Pair => (a < b ? [a, b] : [b, a])
const pairId = ([a, b]: Pair) => `${a}-${b}`

for (const [a, b] of [...STRAIT_EXCLUSIONS, ...STRAIT_ADDITIONS]) {
  if (!gameCodes.has(a) || !gameCodes.has(b))
    throw new EvalError(`Unknown ISO in override: ${a}-${b}`)
  if (a === b) throw new EvalError(`Self-strait override: ${a}`)
  if (isLandBorder(a, b)) throw new EvalError(`Override duplicates a land border: ${a}-${b}`)
}
const excluded = new Set(STRAIT_EXCLUSIONS.map(([a, b]) => pairId(sortedPair(a, b))))
const added = new Set(STRAIT_ADDITIONS.map(([a, b]) => pairId(sortedPair(a, b))))

interface CrossingPoints {
  from: { lat: number; lng: number }
  to: { lat: number; lng: number }
}
const crossingPoints = ({ from, to }: Crossing): CrossingPoints => ({
  from: { lat: lats[from], lng: lngs[from] },
  to: { lat: lats[to], lng: lngs[to] },
})

const edges: { pair: Pair; km: number; crossing?: CrossingPoints }[] = []
const blocked: { pair: Pair; km: number; by: ISOCountryCode }[] = []
const landTouching: Pair[] = []
console.log('Validating crossings…')
for (const [key, km] of nearestKm) {
  const a = Math.floor(key / isoList.length)
  const b = key % isoList.length
  const pair = sortedPair(isoList[a], isoList[b])
  if (isLandBorder(...pair)) continue
  if (km < MIN_STRAIT_KM) {
    landTouching.push(pair)
    continue
  }
  if (km > MAX_STRAIT_KM) continue
  if (excluded.has(pairId(pair))) continue
  if (added.has(pairId(pair))) continue // re-appended below, marked

  const candidates = [...(crossingsOf.get(key)?.values() ?? [])].sort(
    (first, second) => first.km - second.km
  )
  let nearestBlocker: ISOCountryCode | undefined
  let kept = false
  for (const crossing of candidates) {
    const by = crossingBlockedBy(crossing, a, b)
    if (!by) {
      edges.push({ pair, km: crossing.km, crossing: crossingPoints(crossing) })
      kept = true
      break
    }
    nearestBlocker ??= by
  }
  if (!kept && nearestBlocker) blocked.push({ pair, km, by: nearestBlocker })
}

for (const [a, b] of STRAIT_ADDITIONS) {
  const pair = sortedPair(a, b)
  const key = pairKey(isoList.indexOf(pair[0]), isoList.indexOf(pair[1]))
  const best = [...(crossingsOf.get(key)?.values() ?? [])].sort(
    (first, second) => first.km - second.km
  )[0]
  edges.push({
    pair,
    km: nearestKm.get(key) ?? NaN,
    ...(best ? { crossing: crossingPoints(best) } : {}),
  })
}
edges.sort((a, b) => a.km - b.km)
blocked.sort((a, b) => a.km - b.km)

// --- 5. Report + write --------------------------------------------------------
const straits: { [isoCode: string]: ISOCountryCode[] } = {}
for (const isoCode of ISOCountryCodes) straits[isoCode] = []
for (const {
  pair: [a, b],
} of edges) {
  straits[a].push(b)
  straits[b].push(a)
}
for (const isoCode of ISOCountryCodes) straits[isoCode].sort()

const connected = ISOCountryCodes.filter(
  isoCode => straits[isoCode].length > 0 && BORDERS[isoCode].length === 0
)
const isolated = ISOCountryCodes.filter(
  isoCode => straits[isoCode].length === 0 && BORDERS[isoCode].length === 0
)

const report = [
  `Strait edges within ${MAX_STRAIT_KM} km (${edges.length} kept, ${blocked.length} dropped) — review before accepting.`,
  `A + marks a STRAIT_ADDITIONS override.`,
  '',
  ...edges.map(
    ({ pair, km }) =>
      `${added.has(pairId(pair)) ? '+' : ' '} ${pairId(pair)}  ${Number.isFinite(km) ? km.toFixed(1).padStart(7) : '      ?'} km`
  ),
  '',
  `Dropped — crossing runs through or past a third country (${blocked.length}):`,
  ...blocked.map(({ pair, km, by }) => `  ${pairId(pair)}  ${km.toFixed(1).padStart(7)} km  via ${by}`),
  '',
  `Islands now reachable (${connected.length}): ${connected.join(' ')}`,
  `Still isolated (${isolated.length}): ${isolated.join(' ')}`,
  '',
  `Land-touching pairs NOT in BORDERS, skipped as editorial exclusions (${landTouching.length}):`,
  ...landTouching.map(pair => `  ${pairId(pair)}`),
  '',
  `Exclusions applied (${STRAIT_EXCLUSIONS.length}): ${STRAIT_EXCLUSIONS.map(pair => pairId(sortedPair(...pair))).join(' ') || '—'}`,
  '',
].join('\n')
writeFileSync(join(import.meta.dirname, 'data/straits-report.txt'), report)

console.log(
  `${edges.length} strait pairs kept, ${blocked.length} dropped; ${connected.length} islands connected, ${isolated.length} still isolated`
)
console.log('Review generators/data/straits-report.txt')

const round4 = (value: number) => Math.round(value * 10000) / 10000
const crossings: { [pair: string]: CrossingPoints } = {}
for (const { pair, crossing } of edges) {
  if (!crossing) continue
  crossings[pairId(pair)] = {
    from: { lat: round4(crossing.from.lat), lng: round4(crossing.from.lng) },
    to: { lat: round4(crossing.to.lat), lng: round4(crossing.to.lng) },
  }
}

const output = `// Generated by generators/create-straits-file.ts — do not edit by hand.
// Sea adjacency (coastlines within ${MAX_STRAIT_KM} km across own waters, symmetric).
// Border Chain only — deliberately separate from BORDERS.
import type { ISOCountryCode } from '~~/types/geography.types'

export const STRAITS: { [isoCode in ISOCountryCode]: ISOCountryCode[] } = ${JSON.stringify(
  straits,
  null,
  2
)}

/** Where each strait is actually crossed (nearest validated coastline points),
 *  keyed by the sorted "A-B" pair — the map draws its sea-hop arcs here. */
export const STRAIT_CROSSINGS: {
  [pair: string]: { from: { lat: number; lng: number }; to: { lat: number; lng: number } }
} = ${JSON.stringify(crossings, null, 2)}
`
writeFileSync(join(import.meta.dirname, '../data/straits.gen.ts'), output)
console.log('Wrote data/straits.gen.ts')
