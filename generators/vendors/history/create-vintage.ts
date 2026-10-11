/**
 * Generates Vintage's map history from CShapes 2.0, one region at a time:
 *
 *   data/vintage.gen.ts        — geometry, eras and the step stream, with NO
 *                                years (the client view's, lazy import)
 *   data/vintage-years.gen.ts  — each scene's years, its look-alike classes,
 *                                tells, pacing weights and notes (server only)
 *
 * One topology per region across every year, so a border that persisted is
 * ONE arc for its whole life and a change is a set of arcs switching on or
 * off. A year's map is the Dec-31 state; a scene is a run of years whose map
 * looks identical on screen — every name counts as on screen, since any unit
 * can be tapped to read it, however small its outline.
 *
 *   bun run generate:vintage
 *
 * Run after generate:map (projection dependency).
 */
import { writeFileSync } from 'fs'
import { topology } from 'topojson-server'
import { presimplify, quantile, simplify } from 'topojson-simplify'
import type { Feature, MultiPolygon, Polygon } from 'geojson'
import type { GeometryCollection, Topology } from 'topojson-specification'
import { jsonParseLiteral } from '../../lib/emit'
import { balancedAnchor, ringArea } from '../../../lib/outline'
import { VINTAGE_FAME, legibleFame, sceneLegibility } from '../../../lib/vintage-tuning'
import {
  VINTAGE_REGION_IDS,
  type VintageEra,
  type VintageEraSpec,
  type VintageRegion,
  type VintageRegionId,
  type VintageRegionYears,
  type VintageShape,
  type VintageStep,
  type VintageUnitLook,
} from '../../../types/vintage.types'
import { FAME_TIERS } from '../../../types/fame.types'
import { VINTAGE_NOTES } from '../../data/vintage-notes'
import { VINTAGE_REGION_SPECS, VINTAGE_UNITS } from '../../data/vintage-units'
import { buildEuropeKeyframes } from './keyframe-europe'
import {
  asPolygonRings,
  fetchCShapes,
  project,
  roundTo,
  splitAtAntimeridian,
  tupleCompare,
  type CShapesFeature,
  type DateTuple,
  type Point,
} from './cshapes'

const geometryFile = (id: VintageRegionId) => `data/vintage-${id}.gen.ts`
const OUT_YEARS = 'data/vintage-years.gen.ts'
const REPORT_FILE = 'generators/data/vintage-report.txt'
const OHM_CREDIT = `// Europe before 1886: OpenHistoricalMap contributors (openhistoricalmap.org, CC0 1.0;
// some boundary ways CC BY 4.0), at the keyframes in generators/data/vintage-keyframes.ts.
`
const CSHAPES_FIRST_YEAR = 1886
const LAST_YEAR = 2019
/** Islets below this projected area (map units²) are dropped from fills. */
const MIN_RING_AREA = 0.02
/** Tells a scene needs before the dealer may deal it — reported, not enforced. */
const REPORT_TELL_FLOOR = 2

const report: string[] = []
const log = (line: string) => {
  report.push(line)
  console.info(line)
}

// --- Overrides: keep disputed lines where the app's own map draws them --------

/**
 * CShapes follows de facto control, the app's map does not: Crimea stays
 * Ukrainian (create-map reassigns it the same way), Western Sahara keeps its
 * own outline after Spain left, Israel keeps its 1949 line with the West
 * Bank and Gaza as their own territories (the app's Palestine) and Golan and
 * Sinai with Syria and Egypt, and East Timor stays itself through Indonesia's
 * occupation. Every override reuses an exact CShapes geometry, so no shape
 * is ever hand-built.
 */
const applyOverrides = (features: CShapesFeature[]): CShapesFeature[] => {
  const byCode = (gwcode: number) => features.filter(entry => entry.gwcode === gwcode)
  const endingIn = (gwcode: number, year: number) =>
    byCode(gwcode).find(entry => entry.end[0] === year)
  const reuse = (
    gwcode: number,
    fromYear: number,
    source: CShapesFeature | undefined,
    untilYear = Infinity
  ) => {
    if (!source) throw new Error(`Override source missing for ${gwcode}`)
    for (const entry of byCode(gwcode))
      if (entry.start[0] >= fromYear && entry.start[0] < untilYear)
        entry.feature = { ...entry.feature, geometry: source.feature.geometry }
  }
  const latest = (gwcode: number) => {
    const entry = byCode(gwcode).sort((a, b) => tupleCompare(b.start, a.start))[0]
    if (!entry) throw new Error(`CShapes has no ${gwcode}`)
    return entry
  }
  const sliceFrom = (gwcode: number, year: number) => {
    const entry = byCode(gwcode).find(candidate => candidate.start[0] === year)
    if (!entry) throw new Error(`CShapes has no ${gwcode} slice from ${year}`)
    return entry
  }

  const occupied = sliceFrom(666, 1967)
  reuse(666, 1967, endingIn(666, 1967))
  reuse(652, 1967, endingIn(652, 1967))
  reuse(651, 1967, endingIn(651, 1967))
  const annexed = sliceFrom(850, 1976)
  reuse(850, 1976, endingIn(850, 1976), 2002)

  reuse(365, 2014, endingIn(365, 2014))
  reuse(369, 2014, endingIn(369, 2014))
  reuse(600, 1975, endingIn(600, 1975))
  reuse(435, 1975, endingIn(435, 1975))

  const spanishSahara = byCode(609).sort((a, b) => tupleCompare(b.start, a.start))[0]
  if (!spanishSahara) throw new Error('Spanish Sahara missing from CShapes')
  const lastDay = features.reduce<DateTuple>(
    (latest, entry) => (tupleCompare(entry.end, latest) > 0 ? entry.end : latest),
    [0, 0, 0]
  )
  const afterSpain = byCode(600).find(entry => entry.start[0] === 1975)
  if (!afterSpain) throw new Error('Morocco 1975 slice missing from CShapes')
  return [
    ...features,
    { ...spanishSahara, start: afterSpain.start, end: lastDay, name: 'Western Sahara' },
    { ...latest(6631), start: occupied.start, end: lastDay },
    { ...latest(6511), start: occupied.start, end: lastDay },
    { ...endingIn(860, 1976)!, start: annexed.start, end: annexed.end },
  ]
}

// --- Geometry ---------------------------------------------------------------

/** Sutherland–Hodgman against one axis-aligned half-plane. */
const clipEdge = (
  ring: Point[],
  inside: (p: Point) => boolean,
  cut: (a: Point, b: Point) => Point
) => {
  const output: Point[] = []
  for (let i = 0; i < ring.length; i++) {
    const current = ring[i]
    const previous = ring[(i + ring.length - 1) % ring.length]
    if (inside(current)) {
      if (!inside(previous)) output.push(cut(previous, current))
      output.push(current)
    } else if (inside(previous)) output.push(cut(previous, current))
  }
  return output
}

const clipRing = (ring: Point[], [west, south, east, north]: [number, number, number, number]) => {
  const atX =
    (x: number) =>
    (a: Point, b: Point): Point => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])]
  const atY =
    (y: number) =>
    (a: Point, b: Point): Point => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y]
  let points = ring
  points = clipEdge(points, p => p[0] >= west, atX(west))
  points = clipEdge(points, p => p[0] <= east, atX(east))
  points = clipEdge(points, p => p[1] >= south, atY(south))
  points = clipEdge(points, p => p[1] <= north, atY(north))
  return points
}

const boxesOverlap = (
  rings: Point[][],
  [west, south, east, north]: [number, number, number, number]
) =>
  rings.some(ring =>
    ring.some(([lon, lat]) => lon >= west && lon <= east && lat >= south && lat <= north)
  )

/** Clip each polygon of a feature to the box, keeping holes with their shell. */
const clipFeature = (
  feature: Feature<Polygon | MultiPolygon>,
  box: [number, number, number, number]
): Feature<MultiPolygon> | undefined => {
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates as Point[][]]
      : (feature.geometry.coordinates as Point[][][])
  const clipped = polygons
    .flatMap(polygon => {
      const [shell, ...holes] = polygon
      return splitAtAntimeridian(shell).map(part => [part, ...holes])
    })
    .map(polygon => polygon.map(ring => clipRing(ring, box)).filter(ring => ring.length >= 3))
    .filter(polygon => polygon.length && polygon[0].length >= 3)
    .map(polygon => polygon.map(ring => [...ring, ring[0]]))
  if (!clipped.length) return undefined
  return { ...feature, geometry: { type: 'MultiPolygon', coordinates: clipped } }
}

const projectBox = ([west, south, east, north]: [number, number, number, number]): [
  number,
  number,
  number,
  number,
] => {
  const edge: Point[] = []
  for (let step = 0; step <= 20; step++) {
    const t = step / 20
    edge.push([west + (east - west) * t, south], [west + (east - west) * t, north])
    edge.push([west, south + (north - south) * t], [east, south + (north - south) * t])
  }
  const projected = edge.map(project)
  const xs = projected.map(([x]) => x)
  const ys = projected.map(([, y]) => y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return [
    roundTo(minX),
    roundTo(minY),
    roundTo(Math.max(...xs) - minX),
    roundTo(Math.max(...ys) - minY),
  ]
}

/** How far a label may spill over the sea, in multiples of the outline's room. */
const SEA_SPILL = 3

interface RunEdge {
  a: Point
  b: Point
  /** Faces the sea (or the clip): a label may spill across it. */
  open: boolean
}

/**
 * Twice the distance from `at` to the nearer blocking edge along the
 * horizontal through it — the widest label centred on `at` that never lands
 * on a neighbour. Coastline is open up to `SEA_SPILL` rooms, the way an atlas
 * lets "United Kingdom" run out over the water.
 */
const centredRun = (edges: RunEdge[], [ax, ay]: Point, room: number): number => {
  const reach = room * SEA_SPILL
  let left = ax - reach
  let right = ax + reach
  for (const {
    a: [x1, y1],
    b: [x2, y2],
    open,
  } of edges) {
    if (open || y1 > ay === y2 > ay) continue
    const x = x1 + ((ay - y1) * (x2 - x1)) / (y2 - y1)
    if (x <= ax) left = Math.max(left, x)
    else right = Math.min(right, x)
  }
  return 2 * Math.max(0, Math.min(ax - left, right - ax))
}

const decodeArc = (index: number, arcs: Point[][]): Point[] =>
  index >= 0 ? arcs[index] : [...arcs[~index]].reverse()

const ringPoints = (ring: number[], arcs: Point[][]): Point[] => {
  const points: Point[] = []
  for (const index of ring) {
    const arc = decodeArc(index, arcs)
    points.push(...(points.length ? arc.slice(1) : arc))
  }
  return points
}

// --- Chains: a run of arcs end to end, for detecting borders that moved ------

const nodeKey = ([x, y]: Point) => `${x},${y}`

interface Chain {
  arcs: number[]
  ends: [string, string]
}

const chainsOf = (arcIds: number[], arcs: Point[][]): Chain[] => {
  const endsOf = (id: number): [string, string] => {
    const arc = arcs[id]
    return [nodeKey(arc[0]), nodeKey(arc[arc.length - 1])]
  }
  const incident = new Map<string, number[]>()
  for (const id of arcIds)
    for (const node of endsOf(id)) incident.set(node, [...(incident.get(node) ?? []), id])

  const used = new Set<number>()
  const chains: Chain[] = []
  const walk = (start: string, first: number): Chain => {
    const signed: number[] = []
    let node = start
    let arc: number | undefined = first
    while (arc !== undefined && !used.has(arc)) {
      used.add(arc)
      const [a, b] = endsOf(arc)
      signed.push(a === node ? arc : ~arc)
      node = a === node ? b : a
      const onward: number[] = (incident.get(node) ?? []).filter(id => !used.has(id))
      arc = incident.get(node)?.length === 2 ? onward[0] : undefined
    }
    return { arcs: signed, ends: [start, node] }
  }
  // Open chains first: start at every node that is not a pass-through.
  for (const [node, ids] of incident)
    if (ids.length !== 2) for (const id of ids) if (!used.has(id)) chains.push(walk(node, id))
  for (const id of arcIds) if (!used.has(id)) chains.push(walk(endsOf(id)[0], id))
  return chains
}

const reverseChain = (chain: number[]) => [...chain].reverse().map(id => ~id)

/** A border pair this close (mean gap, map units) morphs rather than one
 *  erasing while the other draws — a frontier moving, not a new one. */
const MORPH_REACH = 9
const MORPH_SAMPLES = 24

const chainPoints = (chain: number[], arcs: Point[][]): Point[] => {
  const points: Point[] = []
  for (const signed of chain) {
    const arc = decodeArc(signed, arcs)
    points.push(...(points.length ? arc.slice(1) : arc))
  }
  return points
}

const resample = (points: Point[], count: number): Point[] => {
  const lengths = points
    .slice(1)
    .map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1]))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  if (!total) return Array.from({ length: count }, () => points[0])
  const output: Point[] = []
  let segment = 0
  let travelled = 0
  for (let index = 0; index < count; index++) {
    const target = (total * index) / (count - 1)
    while (segment < lengths.length - 1 && travelled + lengths[segment] < target)
      travelled += lengths[segment++]
    const t = lengths[segment] ? (target - travelled) / lengths[segment] : 0
    const [x1, y1] = points[segment]
    const [x2, y2] = points[segment + 1] ?? points[segment]
    output.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t])
  }
  return output
}

const meanGap = (a: Point[], b: Point[]) =>
  a.reduce(
    (sum, point, index) => sum + Math.hypot(point[0] - b[index][0], point[1] - b[index][1]),
    0
  ) / a.length

const pairSlides = (erase: number[], draw: number[], arcs: Point[][]) => {
  const before = chainsOf(erase, arcs).filter(chain => chain.ends[0] !== chain.ends[1])
  const after = chainsOf(draw, arcs).filter(chain => chain.ends[0] !== chain.ends[1])
  const slides: VintageStep['slides'] = []
  const taken = new Set<Chain>()
  const paired = new Set<Chain>()
  for (const from of before) {
    const match = after.find(
      to =>
        !taken.has(to) &&
        ((to.ends[0] === from.ends[0] && to.ends[1] === from.ends[1]) ||
          (to.ends[0] === from.ends[1] && to.ends[1] === from.ends[0]))
    )
    if (!match) continue
    taken.add(match)
    paired.add(from)
    slides.push({
      from: from.arcs,
      to: match.ends[0] === from.ends[0] ? match.arcs : reverseChain(match.arcs),
    })
  }

  // The rest pair by shape: every candidate scored in both orientations,
  // closest pairs first, so two frontiers never fight over one replacement.
  const candidates: { from: Chain; to: Chain; reversed: boolean; gap: number }[] = []
  for (const from of before) {
    if (paired.has(from)) continue
    const fromLine = resample(chainPoints(from.arcs, arcs), MORPH_SAMPLES)
    for (const to of after) {
      if (taken.has(to)) continue
      const toLine = resample(chainPoints(to.arcs, arcs), MORPH_SAMPLES)
      const forward = meanGap(fromLine, toLine)
      const backward = meanGap(fromLine, [...toLine].reverse())
      const gap = Math.min(forward, backward)
      if (gap <= MORPH_REACH) candidates.push({ from, to, reversed: backward < forward, gap })
    }
  }
  candidates.sort((a, b) => a.gap - b.gap)
  for (const { from, to, reversed } of candidates) {
    if (paired.has(from) || taken.has(to)) continue
    paired.add(from)
    taken.add(to)
    slides.push({ from: from.arcs, to: reversed ? reverseChain(to.arcs) : to.arcs })
  }
  return slides
}

// --- Paper tones ------------------------------------------------------------

const TONES = 5

/**
 * A quiet paper tone per unit, different from every unit it ever borders, so
 * a union reads as one country and a split shows as a tone change as well as
 * a new line. Fixed for the unit's whole life: tones never flicker in a rewind.
 */
const toneUnits = (codes: number[], neighbours: Set<string>): Map<number, number> => {
  const adjacent = (a: number, b: number) => neighbours.has(a < b ? `${a}:${b}` : `${b}:${a}`)
  const near = new Map(codes.map(code => [code, codes.filter(other => adjacent(code, other))]))
  const tones = new Map<number, number>()
  // DSatur: always tone the unit whose neighbours already use the most tones.
  while (tones.size < codes.length) {
    const saturation = (code: number) =>
      new Set(
        near
          .get(code)!
          .map(other => tones.get(other))
          .filter(t => t !== undefined)
      ).size
    const next = codes
      .filter(code => !tones.has(code))
      .sort(
        (a, b) =>
          saturation(b) - saturation(a) || near.get(b)!.length - near.get(a)!.length || a - b
      )[0]
    const taken = new Set(near.get(next)!.map(other => tones.get(other)))
    let tone = 0
    while (taken.has(tone) && tone < TONES - 1) tone++
    if (taken.has(tone)) log(`  ${next}: every tone is taken by a neighbour`)
    tones.set(next, tone)
  }
  return tones
}

// --- Eras -------------------------------------------------------------------

const missingEras = new Set<number>()
const landedNotes = new Set<string>()
/** Eras before 1886, read off the curated keyframes rather than the table. */
let keyframeEras = new Map<number, VintageEraSpec[]>()
const eraSpecFor = (gwcode: number, year: number): VintageEra | undefined => {
  const curated = VINTAGE_UNITS[gwcode]?.eras ?? []
  const earlier = (keyframeEras.get(gwcode) ?? []).filter(
    era => era.from < (curated[0]?.from ?? Infinity)
  )
  const eras = [...earlier, ...curated]
  if (!eras.length) {
    missingEras.add(gwcode)
    return undefined
  }
  const era = [...eras].reverse().find(entry => entry.from <= year)
  if (!era) throw new Error(`Unit ${gwcode} has no era for ${year}`)
  const { from: _from, ...rest } = era
  return rest
}

// --- One region ---------------------------------------------------------------

interface RegionOutput {
  geometry: VintageRegion
  years: VintageRegionYears
}

const aliveOn = (entry: CShapesFeature, year: number) => {
  const reference: DateTuple = [year, 12, 31]
  return tupleCompare(entry.start, reference) <= 0 && tupleCompare(entry.end, reference) >= 0
}

const buildRegion = (id: VintageRegionId, all: CShapesFeature[]): RegionOutput => {
  const spec = VINTAGE_REGION_SPECS[id]
  const firstYear = spec.firstYear ?? CSHAPES_FIRST_YEAR
  const selected = all
    .filter(entry => entry.end[0] >= firstYear && entry.start[0] <= LAST_YEAR)
    .filter(entry => boxesOverlap(asPolygonRings(entry.feature.geometry), spec.clip))
    .map(entry => ({ entry, clipped: clipFeature(entry.feature, spec.clip) }))
    .filter(
      (pair): pair is { entry: CShapesFeature; clipped: Feature<MultiPolygon> } => !!pair.clipped
    )

  type RegionTopology = Topology<{ units: GeometryCollection }>
  const topo = topology(
    { units: { type: 'FeatureCollection', features: selected.map(pair => pair.clipped) } as never },
    1e6
  ) as RegionTopology
  const weighted = presimplify(topo)
  const sourcePoints = weighted.arcs.reduce((total, arc) => total + arc.length, 0)
  const retain = Math.min(1, spec.pointBudget / Math.max(1, sourcePoints))
  const simplified = simplify(weighted, quantile(weighted, retain)) as RegionTopology

  const lonLatArcs = simplified.arcs as unknown as Point[][]
  const arcs: Point[][] = lonLatArcs.map(arc =>
    arc.map(point => {
      const [x, y] = project(point)
      return [roundTo(x), roundTo(y)] as Point
    })
  )

  // Every feature's rings as signed arc lists; the arcs it touches.
  const featurePolygons = simplified.objects.units.geometries.map(
    geometry => (geometry as { arcs?: number[][][] }).arcs ?? []
  )
  const featureRings = featurePolygons.map(polygons => polygons.flat())
  const arcUsers = new Map<number, number[]>()
  featureRings.forEach((rings, feature) => {
    for (const ring of rings)
      for (const signed of ring) {
        const arc = signed < 0 ? ~signed : signed
        const users = arcUsers.get(arc) ?? []
        if (!users.includes(feature)) users.push(feature)
        arcUsers.set(arc, users)
      }
  })

  // Units: the region's own gwcodes, in a stable order.
  const unitCodes = [...new Set(selected.map(pair => pair.entry.gwcode).filter(spec.owns))].sort(
    (a, b) => a - b
  )
  const unitIndex = new Map(unitCodes.map((gwcode, index) => [gwcode, index]))

  const [frameX, frameY, frameW, frameH] = projectBox(spec.frame)
  const visible: [number, number, number, number] = [
    frameX,
    frameY,
    frameX + frameW,
    frameY + frameH,
  ]

  // Shapes, deduped on their visible rings.
  const shapes: VintageShape[] = []
  /** Land each shape shows inside the frame, holes cut out. */
  const shapeAreas: number[] = []
  const shapeKeys = new Map<string, number>()
  const shapeOfFeature = new Map<number, number>()
  const shapeFor = (feature: number): number => {
    const cached = shapeOfFeature.get(feature)
    if (cached !== undefined) return cached
    const rings = featureRings[feature].filter(ring => {
      const points = ringPoints(ring, arcs)
      return points.length >= 4 && ringArea(points) >= MIN_RING_AREA
    })
    const key = JSON.stringify(rings)
    let index = shapeKeys.get(key)
    if (index === undefined) {
      // Anchored on what the frame shows: Russia's pole is beyond the Urals.
      const { gwcode } = selected[feature].entry
      const clippedRing = (ring: number[]) => clipRing(ringPoints(ring, arcs), visible)
      const main = featurePolygons[feature]
        .map(([shell, ...holes]) => ({ shell: clippedRing(shell), holes: holes.map(clippedRing) }))
        .reduce(
          (best, polygon) => (ringArea(polygon.shell) > ringArea(best.shell) ? polygon : best),
          {
            shell: [] as Point[],
            holes: [] as Point[][],
          }
        )
      const pole = balancedAnchor(
        main.shell,
        undefined,
        main.holes.filter(hole => hole.length >= 3)
      )
      const edges: RunEdge[] = featureRings[feature].flatMap(ring =>
        ring.flatMap(signed => {
          const arc = signed < 0 ? ~signed : signed
          const open = (arcUsers.get(arc) ?? []).every(
            user => selected[user].entry.gwcode === gwcode
          )
          const points = arcs[arc]
          return points.slice(1).map((point, index) => ({ a: points[index], b: point, open }))
        })
      )
      index = shapes.length
      shapeAreas.push(
        featurePolygons[feature].reduce(
          (total, [shell, ...holes]) =>
            total +
            ringArea(clippedRing(shell)) -
            holes.reduce((cut, hole) => cut + ringArea(clippedRing(hole)), 0),
          0
        )
      )
      shapes.push({
        rings,
        anchor: pole ? [roundTo(pole.point[0]), roundTo(pole.point[1])] : [0, 0],
        room: pole ? roundTo(pole.radius) : 0,
        span: pole ? roundTo(centredRun(edges, pole.point, pole.radius)) : 0,
      })
      shapeKeys.set(key, index)
    }
    shapeOfFeature.set(feature, index)
    return index
  }

  const eras: VintageEra[] = []
  const eraKeys = new Map<string, number>()
  const eraIndex = (era: VintageEra) => {
    const key = `${era.name}|${era.wash ?? ''}|${era.sovereign}`
    let index = eraKeys.get(key)
    if (index === undefined) {
      index = eras.length
      eras.push(era)
      eraKeys.set(key, index)
    }
    return index
  }

  const neighbours = new Set<string>()

  interface YearState {
    borders: number[]
    looks: VintageUnitLook[]
    labelled: string
    bare: string
    states: number
  }

  const stateOf = (year: number): YearState => {
    const alive = selected
      .map((pair, index) => (aliveOn(pair.entry, year) ? index : -1))
      .filter(i => i >= 0)
    const aliveSet = new Set(alive)
    const touching: [number, number][] = []
    const owned = new Set(alive.filter(index => spec.owns(selected[index].entry.gwcode)))
    const borders = [...arcUsers.entries()]
      .filter(([, users]) => {
        const live = users.filter(user => aliveSet.has(user))
        if (!live.some(user => owned.has(user))) return false
        const codes = [...new Set(live.map(user => selected[user].entry.gwcode))]
        for (const a of codes) for (const b of codes) if (a < b) touching.push([a, b])
        return codes.length >= 2
      })
      .map(([arc]) => arc)
      .sort((a, b) => a - b)

    const looks: VintageUnitLook[] = unitCodes.map(() => [-1, -1])
    let states = 0
    for (const feature of owned) {
      const { gwcode } = selected[feature].entry
      const era = eraSpecFor(gwcode, year)
      if (!era) continue
      if (era.sovereign) states++
      looks[unitIndex.get(gwcode)!] = [shapeFor(feature), eraIndex(era)]
    }
    // Tones only show on paper, so only paper neighbours need to differ.
    const onPaper = (gwcode: number) => spec.owns(gwcode) && !eraSpecFor(gwcode, year)?.wash
    for (const [a, b] of touching) if (onPaper(a) && onPaper(b)) neighbours.add(`${a}:${b}`)
    // Borders are left out on purpose: every border a region unit owns moves
    // only with its shape, and the rest are context units changing at the
    // frame's edge — scenes that would look identical and teach nothing.
    const visible = (labelled: boolean) =>
      JSON.stringify(
        looks.map(([shape, era]) => {
          if (shape < 0) return null
          return [shape, eras[era].wash ?? '', labelled ? eras[era].name : '']
        })
      )
    return { borders, looks, labelled: visible(true), bare: visible(false), states }
  }

  const yearStates: YearState[] = []
  for (let year = firstYear; year <= LAST_YEAR; year++) yearStates.push(stateOf(year))

  const tones = toneUnits(unitCodes, neighbours)

  // Scenes: runs of years that look identical with labels on.
  const scenes: { from: number; to: number; state: YearState }[] = []
  yearStates.forEach((state, offset) => {
    const year = firstYear + offset
    const last = scenes[scenes.length - 1]
    if (last && last.state.labelled === state.labelled) last.to = year
    else scenes.push({ from: year, to: year, state })
  })

  const classesBy = (key: (state: YearState) => string) => {
    const seen = new Map<string, number>()
    return scenes.map((scene, index) => {
      const value = key(scene.state)
      if (!seen.has(value)) seen.set(value, index)
      return seen.get(value)!
    })
  }

  const unitDiffers = (a: VintageUnitLook, b: VintageUnitLook, labelled: boolean) => {
    if (a[0] < 0 !== b[0] < 0) return true
    if (a[0] < 0) return false
    if (a[0] !== b[0]) return true
    if ((eras[a[1]].wash ?? '') !== (eras[b[1]].wash ?? '')) return true
    return labelled && eras[a[1]].name !== eras[b[1]].name
  }

  const today = scenes[scenes.length - 1].state
  const tellsBy = (labelled: boolean) =>
    scenes.map(
      scene =>
        scene.state.looks.filter((look, unit) => unitDiffers(look, today.looks[unit], labelled))
          .length
    )

  const steps: VintageStep[] = []
  const weights = { labelled: [] as number[], bare: [] as number[] }
  for (let index = 0; index + 1 < scenes.length; index++) {
    const before = scenes[index].state
    const after = scenes[index + 1].state
    const beforeSet = new Set(before.borders)
    const afterSet = new Set(after.borders)
    const erase = before.borders.filter(arc => !afterSet.has(arc))
    const draw = after.borders.filter(arc => !beforeSet.has(arc))
    const units: VintageStep['units'] = []
    before.looks.forEach((look, unit) => {
      const next = after.looks[unit]
      if (look[0] !== next[0] || look[1] !== next[1])
        units.push([unit, look[0], look[1], next[0], next[1]])
    })
    const slides = pairSlides(erase, draw, arcs)
    steps.push({ erase, draw, units, slides })
    const weigh = (labelled: boolean) =>
      units.filter(([unit]) => unitDiffers(before.looks[unit], after.looks[unit], labelled))
        .length + slides.length
    weights.labelled.push(weigh(true))
    weights.bare.push(weigh(false))
  }

  // What a step visibly changes, as a share of the frame: recolours and
  // arrivals count whole, a moved border the land it moves, a rename half.
  const salience = steps.map(step => {
    let changed = 0
    for (const [, beforeShape, beforeEra, afterShape, afterEra] of step.units) {
      if (beforeShape < 0 && afterShape < 0) continue
      if (beforeShape < 0 || afterShape < 0) {
        changed += shapeAreas[Math.max(beforeShape, afterShape)]
        continue
      }
      if ((eras[beforeEra].wash ?? '') !== (eras[afterEra].wash ?? '')) {
        changed += shapeAreas[afterShape]
        continue
      }
      changed += Math.abs(shapeAreas[beforeShape] - shapeAreas[afterShape])
      if (eras[beforeEra].name !== eras[afterEra].name)
        changed += VINTAGE_FAME.rename * shapeAreas[afterShape]
    }
    return changed / (frameW * frameH)
  })
  const spans = scenes.map(scene => [scene.from, scene.to] as [number, number])
  const labelledClasses = classesBy(state => state.labelled)
  const legibility = sceneLegibility({ spans, classes: labelledClasses, salience })
  const fame = legibility.map(legibleFame)

  // Notes must land on a step that touches their unit in their year.
  const notes: Record<string, string> = {}
  for (const [key, note] of Object.entries(VINTAGE_NOTES)) {
    const [gwcode, year] = key.split(':').map(Number)
    if (!spec.owns(gwcode) || !unitIndex.has(gwcode)) continue
    const stepIndex = scenes.findIndex(scene => scene.from === year) - 1
    const touched =
      stepIndex >= 0 && steps[stepIndex].units.some(([unit]) => unit === unitIndex.get(gwcode))
    if (touched) {
      notes[key] = note
      landedNotes.add(key)
    }
  }

  const tells = { labelled: tellsBy(true), bare: tellsBy(false) }
  const slideCount = steps.reduce((total, step) => total + step.slides.length, 0)
  const keptPoints = arcs.reduce((total, arc) => total + arc.length, 0)
  log(
    `${id}: ${selected.length} slices, ${unitCodes.length} units, ${arcs.length} arcs, ${keptPoints} points, ` +
      `${shapes.length} shapes, ${eras.length} eras, ${scenes.length} scenes, ${slideCount} slides`
  )
  log(
    `  scenes: ${scenes
      .map(
        (scene, index) =>
          `${scene.from === scene.to ? scene.from : `${scene.from}–${scene.to}`}(${tells.labelled[index]}/${tells.bare[index]})`
      )
      .join(' ')}`
  )
  log(
    `  below the ${REPORT_TELL_FLOOR}-tell floor: ${scenes
      .filter((_, index) => tells.labelled[index] < REPORT_TELL_FLOOR)
      .map(scene => scene.from)
      .join(' ')}`
  )
  for (const tier of FAME_TIERS)
    log(
      `  ${tier}: ${scenes
        .flatMap((scene, index) =>
          fame[index] === tier && index < scenes.length - 1
            ? [
                `${scene.from === scene.to ? scene.from : `${scene.from}–${scene.to}`}(${Math.round(legibility[index] * 100)})`,
              ]
            : []
        )
        .join(' ')}`
    )
  log(
    `  slides at: ${steps
      .map((step, index) =>
        step.slides.length ? `${scenes[index + 1].from}(${step.slides.length})` : ''
      )
      .filter(Boolean)
      .join(' ')}`
  )

  const first = scenes[0].state
  return {
    geometry: {
      frame: projectBox(spec.frame),
      arcs: arcs.map(arc => arc.flat()),
      shapes,
      units: unitCodes.map(gwcode => ({
        gwcode,
        tone: tones.get(gwcode) ?? 0,
        ...(VINTAGE_UNITS[gwcode]?.iso ? { iso: VINTAGE_UNITS[gwcode].iso } : {}),
      })),
      eras,
      first: { borders: first.borders, looks: first.looks },
      steps,
    },
    years: {
      spans,
      classes: {
        labelled: labelledClasses,
        bare: classesBy(state => state.bare),
      },
      tells,
      weights,
      fame,
      states: yearStates.map(state => state.states),
      firstYear,
      notes,
    },
  }
}

const main = async () => {
  const features = applyOverrides(await fetchCShapes())
  const europe = VINTAGE_REGION_SPECS.europe
  const keyframes = await buildEuropeKeyframes(features, europe.clip, europe.frame, europe.owns)
  keyframeEras = keyframes.eras
  log('europe keyframes (OpenHistoricalMap):')
  keyframes.report.forEach(log)
  const geometry = {} as Record<VintageRegionId, VintageRegion>
  const years = {} as Record<VintageRegionId, VintageRegionYears>
  for (const id of VINTAGE_REGION_IDS) {
    const output = buildRegion(
      id,
      id === 'europe' ? [...features, ...keyframes.features] : features
    )
    geometry[id] = output.geometry
    years[id] = output.years
  }
  for (const key of Object.keys(VINTAGE_NOTES))
    if (!landedNotes.has(key)) log(`Note ${key} lands on no change in any region — check the year`)
  if (missingEras.size) {
    log(`Units with no era table: ${[...missingEras].sort((a, b) => a - b).join(', ')}`)
    throw new Error(
      'Every unit a region owns needs an era table in generators/data/vintage-units.ts'
    )
  }

  const header = `// Generated by generators/vendors/history/create-vintage.ts — do not edit by hand.
// Source: CShapes 2.0 (icr.ethz.ch/data/cshapes, CC BY-NC-SA 4.0 — Schvitz, Girardin,
// Rüegger, Walter, Cederman & Weidmann 2022, Journal of Conflict Resolution).
`
  for (const id of VINTAGE_REGION_IDS)
    writeFileSync(
      geometryFile(id),
      `${header}${id === 'europe' ? OHM_CREDIT : ''}// Projected with the map's fitted Robinson (see data/map.gen.ts). Holds no years.
// Lazy-import only, from the client view (loadVintageRegion in lib/vintage.ts).
import type { VintageRegion } from '~~/types/vintage.types'

export const VINTAGE_REGION: VintageRegion = ${jsonParseLiteral(geometry[id])}
`
    )
  writeFileSync(
    OUT_YEARS,
    `${header}${OHM_CREDIT}// The answers: server-only, never imported outside lib/events/server.
import type { VintageRegionId, VintageRegionYears } from '~~/types/vintage.types'

export const VINTAGE_YEARS: Record<VintageRegionId, VintageRegionYears> = ${JSON.stringify(years)}
`
  )
  writeFileSync(REPORT_FILE, report.join('\n') + '\n')
}

await main()
