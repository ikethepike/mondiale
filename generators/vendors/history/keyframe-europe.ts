import type { Feature, MultiPolygon, Polygon } from 'geojson'
import polygonClipping, {
  type Geom,
  type MultiPolygon as ClipMultiPolygon,
  type Polygon as ClipPolygon,
} from 'polygon-clipping'
import type { VintageEraSpec } from '../../../types/vintage.types'
import {
  KEYFRAME_CARRIED_BACK,
  KEYFRAME_POLITIES,
  KEYFRAME_RECORDED_LATER,
  KEYFRAME_SKIPPED,
  VINTAGE_KEYFRAMES,
  type KeyframePolity,
} from '../../data/vintage-keyframes'
import { VINTAGE_UNITS } from '../../data/vintage-units'
import { tupleCompare, type CShapesFeature, type DateTuple, type Point } from './cshapes'
import { fetchOhmGeometries, fetchOhmIndex, stitchLosses, type OhmIndexEntry } from './ohm'

/**
 * Europe's keyframes as CShapes-shaped features, so the region builds them
 * like any other slice. Three rules keep the 1886 seam honest:
 *
 * - every coastline is CShapes' own (each polity is cut to its 1886 land);
 * - a polity whose keyframe shape matches its 1886 outline takes that exact
 *   outline — frozen — so a border that never moved never redraws;
 * - the rest yield to frozen polities and fill the slivers between, which
 *   puts every border they share with one on CShapes' coordinates.
 */

type Box = [number, number, number, number]

const COUNTRY = 2
const FROZEN = 3
/** Coordinates snap to a 1/GRID_SCALE° grid before any boolean work —
 *  OpenHistoricalMap's ways are far denser than the map draws, and a shared
 *  way snaps the same on both sides. */
const GRID_SCALE = 20
/** Two drawings of one polity differ by long thin slivers when only the
 *  sources disagree (OpenHistoricalMap and CShapes sit 1–5 km apart along a
 *  whole border), and by a solid piece when land changed hands. A piece this
 *  large and this thick (twice its area over its perimeter) is a change;
 *  anything thinner is the same border drawn twice. */
const CHANGE_KM2 = 1000
const CHANGE_THICK_KM = 15
/** Below this many km² a polity is a speck at the region's zoom and its land
 *  goes to a neighbour; a curated polity was chosen on purpose, so its floor
 *  only drops true microstates. */
const MIN_KM2 = 6000
const MIN_CURATED_KM2 = 100
/** How far past the frame the keyframes are drawn — beyond it the field has
 *  feathered out, and every extra border there is weight for nothing. */
const MARGIN = 0.3
/** A polity this much inside another is part of it (Congress Poland in the
 *  Russian Empire's relation) and is carved out of it, never swallowed. */
const NESTED_SHARE = 0.8
/** Unclaimed land is found tile by tile: one sweep over the whole region
 *  nests slivers deeper than polygon-clipping can recurse. */
const GAP_TILE = 4
/** How far a stand-in may be borrowed across a hole in the record. */
const STAND_IN_YEARS = 5

const boxPolygon = ([west, south, east, north]: Box): ClipPolygon => [
  [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ],
]

const KM_PER_DEGREE = 111.32

const ringKm2 = (ring: readonly (readonly [number, number])[]) => {
  let area = 0
  const midLat = ring.reduce((sum, [, lat]) => sum + lat, 0) / Math.max(1, ring.length)
  const shrink = Math.cos((midLat * Math.PI) / 180)
  for (let index = 0; index + 1 < ring.length; index++) {
    const [x1, y1] = ring[index]
    const [x2, y2] = ring[index + 1]
    area += x1 * shrink * y2 - x2 * shrink * y1
  }
  return (Math.abs(area) / 2) * KM_PER_DEGREE * KM_PER_DEGREE
}

const ringKm = (ring: readonly (readonly [number, number])[]) => {
  let length = 0
  for (let index = 0; index + 1 < ring.length; index++) {
    const [x1, y1] = ring[index]
    const [x2, y2] = ring[index + 1]
    const shrink = Math.cos((((y1 + y2) / 2) * Math.PI) / 180)
    length += Math.hypot((x2 - x1) * shrink, y2 - y1) * KM_PER_DEGREE
  }
  return length
}

const km2 = (geometry: ClipMultiPolygon) =>
  geometry.reduce(
    (total, [shell, ...holes]) =>
      total + ringKm2(shell) - holes.reduce((cut, hole) => cut + ringKm2(hole), 0),
    0
  )

const snap = (geometry: ClipMultiPolygon): ClipMultiPolygon => {
  const snapped = geometry
    .map(polygon =>
      polygon
        .map(ring => {
          const points: [number, number][] = []
          for (const [lon, lat] of ring) {
            const point: [number, number] = [
              Math.round(lon * GRID_SCALE) / GRID_SCALE,
              Math.round(lat * GRID_SCALE) / GRID_SCALE,
            ]
            const last = points[points.length - 1]
            if (!last || last[0] !== point[0] || last[1] !== point[1]) points.push(point)
          }
          return points
        })
        .filter(ring => ring.length >= 4)
    )
    .filter(polygon => polygon.length)
  return snapped.length ? ops.union(snapped) : []
}

/** polygon-clipping can dead-end on near-degenerate input: retry on ever
 *  coarser snapped operands, then one operand at a time, skipping (and
 *  reporting) only an operand that still fails. */
const settle = (geometry: Geom, scale: number): ClipMultiPolygon =>
  asMulti(geometry).map(polygon =>
    polygon.map(ring =>
      ring.map(([lon, lat]): [number, number] => [
        Math.round(lon * scale) / scale,
        Math.round(lat * scale) / scale,
      ])
    )
  )
const asMulti = (geometry: Geom): ClipMultiPolygon =>
  typeof geometry[0]?.[0]?.[0] === 'number'
    ? [geometry as ClipPolygon]
    : (geometry as ClipMultiPolygon)
const robust =
  (name: string, operation: (a: Geom, ...rest: Geom[]) => ClipMultiPolygon) =>
  (a: Geom, ...rest: Geom[]): ClipMultiPolygon => {
    const attempt = (left: Geom, right: Geom[]) => {
      let failure: unknown
      for (const scale of [0, 1e6, 1e4, 1e3]) {
        try {
          return scale
            ? operation(settle(left, scale), ...right.map(geometry => settle(geometry, scale)))
            : operation(left, ...right)
        } catch (error) {
          failure = error
        }
      }
      throw failure
    }
    try {
      return attempt(a, rest)
    } catch (failure) {
      if (name === 'xor') {
        const rings = [a, ...rest].reduce(
          (total, geometry) => total + asMulti(geometry).flat().length,
          0
        )
        throw new Error(`${name} failed on ${rings} rings`, { cause: failure })
      }
      return rest.reduce<ClipMultiPolygon>((result, next) => {
        try {
          return attempt(result, [next])
        } catch (error) {
          skippedOperations.push(`${name}: ${(error as Error).message.slice(0, 120)}`)
          return result
        }
      }, asMulti(a))
    }
  }
const skippedOperations: string[] = []
const ops = {
  union: robust('union', polygonClipping.union),
  intersection: robust('intersection', polygonClipping.intersection),
  difference: robust('difference', polygonClipping.difference),
  xor: robust('xor', polygonClipping.xor),
}

const union = (geometries: ClipMultiPolygon[]): ClipMultiPolygon =>
  geometries.length ? ops.union(geometries[0], ...geometries.slice(1)) : []

const toClip = (feature: CShapesFeature): ClipMultiPolygon =>
  feature.feature.geometry.type === 'Polygon'
    ? [feature.feature.geometry.coordinates as ClipPolygon]
    : (feature.feature.geometry.coordinates as ClipMultiPolygon)

const aliveAt = (entry: OhmIndexEntry, date: DateTuple) =>
  !!entry.start &&
  tupleCompare(entry.start, date) <= 0 &&
  (!entry.end || tupleCompare(entry.end, date) > 0)

const touchesBox = (entry: OhmIndexEntry, [west, south, east, north]: Box) => {
  const bounds = entry.bounds
  if (!bounds || bounds.maxlat < south || bounds.minlat > north) return false
  if (bounds.maxlon < bounds.minlon) return true
  return bounds.maxlon >= west && bounds.minlon <= east
}

/**
 * Clipping against a neighbour leaves its crossing points on the shared
 * line, in one ring but not the other — and topology then splits that
 * border at every one, into thousands of two-point arcs. A vertex sitting
 * straight between its neighbours that no other ring shares carries no
 * shape, so it goes.
 */
const dropStrayVertices = (geometries: ClipMultiPolygon[]): ClipMultiPolygon[] => {
  const key = ([lon, lat]: readonly number[]) => `${lon},${lat}`
  const users = new Map<string, number>()
  geometries.forEach(geometry => {
    const mine = new Set<string>()
    for (const polygon of geometry)
      for (const ring of polygon) for (const p of ring) mine.add(key(p))
    for (const k of mine) users.set(k, (users.get(k) ?? 0) + 1)
  })
  const straight = (a: number[], b: number[], c: number[]) => {
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    const span = Math.hypot(c[0] - a[0], c[1] - a[1])
    return span > 0 && Math.abs(cross) / span < 1e-6
  }
  return geometries.map(geometry =>
    geometry
      .map(polygon =>
        polygon
          .map(ring => {
            const open = ring.slice(0, -1)
            const kept = open.filter((point, at) => {
              if ((users.get(key(point)) ?? 0) > 1) return true
              const before = open[(at + open.length - 1) % open.length]
              const after = open[(at + 1) % open.length]
              return !straight(before, point, after)
            })
            return kept.length >= 3 ? [...kept, kept[0]] : []
          })
          .filter(ring => ring.length)
      )
      .filter(polygon => polygon.length)
  )
}

/** Snap reach and bridge limits for carrying a border from one keyframe to
 *  the next: a line within POOL_SNAP of one already drawn becomes it. */
const POOL_SNAP = 0.03
const POOL_CELL = 0.1
const POOL_BRIDGE = 60

type Pair = [number, number]

/**
 * Every line already drawn — CShapes' 1886 map first, then each keyframe in
 * turn, newest to oldest. A border that did not move between two keyframes
 * is the same line twice over in OpenHistoricalMap's relations, never the
 * same coordinates; conflating onto this pool makes it one line, so topology
 * keeps it as one arc instead of shattering it wherever the two copies part.
 */
class LinePool {
  private rings: Pair[][] = []
  private cells = new Map<string, Pair[]>()
  private positions = new Map<string, { ring: number; at: number }[]>()

  private static key = ([lon, lat]: readonly number[]) => `${lon},${lat}`
  private static cell = ([lon, lat]: readonly number[]) =>
    `${Math.floor(lon / POOL_CELL)},${Math.floor(lat / POOL_CELL)}`

  add(geometry: ClipMultiPolygon) {
    for (const polygon of geometry)
      for (const closed of polygon) {
        const ring = closed.slice(0, -1) as Pair[]
        const id = this.rings.push(ring) - 1
        ring.forEach((point, at) => {
          const key = LinePool.key(point)
          const known = this.positions.get(key)
          if (!known) {
            const cell = LinePool.cell(point)
            this.cells.set(cell, [...(this.cells.get(cell) ?? []), point])
          }
          this.positions.set(key, [...(known ?? []), { ring: id, at }])
        })
      }
  }

  private nearest(point: Pair): Pair {
    const [cx, cy] = [Math.floor(point[0] / POOL_CELL), Math.floor(point[1] / POOL_CELL)]
    let best: Pair = point
    let reach = POOL_SNAP
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const candidate of this.cells.get(`${cx + dx},${cy + dy}`) ?? []) {
          const distance = Math.hypot(candidate[0] - point[0], candidate[1] - point[1])
          if (distance < reach) [best, reach] = [candidate, distance]
        }
    return best
  }

  /** The pool's own vertices strictly between two of its points, when one
   *  ring joins them by a short way. */
  private bridge(a: Pair, b: Pair): Pair[] {
    const from = this.positions.get(LinePool.key(a))
    const to = this.positions.get(LinePool.key(b))
    if (!from || !to) return []
    let best: Pair[] | undefined
    const straight = Math.hypot(b[0] - a[0], b[1] - a[1])
    for (const start of from)
      for (const end of to) {
        if (start.ring !== end.ring) continue
        const ring = this.rings[start.ring]
        const n = ring.length
        const forward = (end.at - start.at + n) % n
        const backward = (start.at - end.at + n) % n
        const steps = Math.min(forward, backward)
        if (steps < 2 || steps > POOL_BRIDGE || (best && best.length <= steps - 1)) continue
        const path: Pair[] = []
        for (let k = 1; k < steps; k++)
          path.push(ring[(start.at + (forward <= backward ? k : -k) + n) % n])
        let length = 0
        let previous = a
        for (const point of [...path, b]) {
          length += Math.hypot(point[0] - previous[0], point[1] - previous[1])
          previous = point
        }
        if (length <= straight * 3 + POOL_SNAP * 3) best = path
      }
    return best ?? []
  }

  conflate(geometry: ClipMultiPolygon): ClipMultiPolygon {
    return geometry
      .map(polygon =>
        polygon
          .map(closed => {
            const snapped = (closed.slice(0, -1) as Pair[]).map(point => this.nearest(point))
            const traced: Pair[] = []
            snapped.forEach((point, at) => {
              traced.push(point, ...this.bridge(point, snapped[(at + 1) % snapped.length]))
            })
            const clean: Pair[] = []
            for (const point of traced) {
              const last = clean[clean.length - 1]
              if (last && last[0] === point[0] && last[1] === point[1]) continue
              const before = clean[clean.length - 2]
              if (before && before[0] === point[0] && before[1] === point[1]) {
                clean.pop()
                continue
              }
              clean.push(point)
            }
            while (
              clean.length > 1 &&
              clean[0][0] === clean[clean.length - 1][0] &&
              clean[0][1] === clean[clean.length - 1][1]
            )
              clean.pop()
            return clean.length >= 3 ? [...clean, clean[0]] : []
          })
          .filter(ring => ring.length)
      )
      .filter(polygon => polygon.length)
  }
}

interface KeyframeUnit {
  gwcode: number
  curated: boolean
  /** The 1886 CShapes feature a frozen unit stands for, emitted as-is so
   *  the region clips both through the same code and the seam is exact. */
  source?: Feature<Polygon | MultiPolygon>
  era: Omit<VintageEraSpec, 'from'>
  rank: number
  geometry: ClipMultiPolygon
}

export interface KeyframeOutput {
  features: CShapesFeature[]
  eras: Map<number, VintageEraSpec[]>
  report: string[]
}

export const buildEuropeKeyframes = async (
  cshapes: CShapesFeature[],
  clip: Box,
  frame: Box,
  owns: (gwcode: number) => boolean
): Promise<KeyframeOutput> => {
  const report: string[] = []
  const [west, south, east, north] = clip
  const index = await fetchOhmIndex([south, west, north, east], [2, 3])

  const seam: DateTuple = [1886, 12, 31]
  const at1886 = cshapes.filter(
    entry => tupleCompare(entry.start, seam) <= 0 && tupleCompare(entry.end, seam) >= 0
  )
  const clipBox = boxPolygon(clip)
  const frameBox = boxPolygon(frame)
  const [frameWest, frameSouth, frameEast, frameNorth] = frame
  const marginX = (frameEast - frameWest) * MARGIN
  const marginY = (frameNorth - frameSouth) * MARGIN
  const margin: Box = [
    frameWest - marginX,
    frameSouth - marginY,
    frameEast + marginX,
    frameNorth + marginY,
  ]
  const marginBox = boxPolygon(margin)
  const outline1886 = new Map<number, ClipMultiPolygon>()
  const feature1886 = new Map<number, Feature<Polygon | MultiPolygon>>()
  for (const entry of at1886) {
    const inside = ops.intersection(toClip(entry), clipBox)
    if (!inside.length) continue
    outline1886.set(entry.gwcode, inside)
    feature1886.set(entry.gwcode, entry.feature)
  }
  // Only the region's own land: OpenHistoricalMap draws Algeria inside
  // France, and North Africa is context here, never a subject.
  const land = union(
    [...outline1886.entries()]
      .filter(([gwcode]) => owns(gwcode))
      .map(([, outline]) => ops.intersection(outline, marginBox))
      .filter(part => part.length)
  )

  const autoCodes = new Map<string, number>()
  const polityOf = (entry: OhmIndexEntry): KeyframePolity | undefined => {
    const curated = KEYFRAME_POLITIES[entry.name]
    if (curated) return curated
    if (entry.level !== 2 || KEYFRAME_SKIPPED.has(entry.name)) return undefined
    if (!autoCodes.has(entry.name)) autoCodes.set(entry.name, 0)
    return { gwcode: -1 }
  }

  const eligible = (entry: OhmIndexEntry, year: number) => {
    if (!touchesBox(entry, KEYFRAME_POLITIES[entry.name] ? margin : frame)) return false
    const polity = polityOf(entry)
    if (!polity) return false
    if (entry.level !== 2 && !KEYFRAME_POLITIES[entry.name]) return false
    return polity.until === undefined || year < polity.until
  }
  /** A curated polity the record skips over — alive on both sides of the
   *  keyframe, or listed as recorded only from later — borrows its nearest
   *  version, so a hole in the data never reads as a state that vanished. */
  const standIn = (name: string, date: DateTuple): OhmIndexEntry | undefined => {
    const versions = index.filter(entry => entry.name === name && entry.start)
    const before = versions.filter(
      entry =>
        entry.end && tupleCompare(entry.end, date) <= 0 && date[0] - entry.end[0] <= STAND_IN_YEARS
    )
    const after = versions
      .filter(
        entry => tupleCompare(entry.start!, date) > 0 && entry.start![0] - date[0] <= STAND_IN_YEARS
      )
      .sort((a, b) => tupleCompare(a.start!, b.start!))
    if (!after.length || (!before.length && !KEYFRAME_RECORDED_LATER.has(name))) return undefined
    const latest = before.sort((a, b) => tupleCompare(b.end!, a.end!))[0]
    if (latest && date[0] - latest.end![0] < after[0].start![0] - date[0]) return latest
    return after[0]
  }
  const picked = VINTAGE_KEYFRAMES.map(year => {
    const date: DateTuple = [year, 12, 31]
    const alive = index.filter(entry => aliveAt(entry, date) && eligible(entry, year))
    const present = new Set(alive.map(entry => entry.name))
    for (const name of Object.keys(KEYFRAME_POLITIES)) {
      if (present.has(name)) continue
      const borrowed = standIn(name, date)
      if (borrowed && eligible(borrowed, year)) alive.push(borrowed)
    }
    return alive
  })
  ;[...autoCodes.keys()].sort().forEach((name, offset) => autoCodes.set(name, 2700 + offset))

  const geometries = await fetchOhmGeometries([...new Set(picked.flat().map(entry => entry.id))])
  const prepared = new Map<number, ClipMultiPolygon>()
  const preparedOf = (id: number) => {
    let geometry = prepared.get(id)
    if (!geometry) {
      const raw = geometries.get(id) ?? []
      geometry = raw.length ? ops.intersection(snap(raw), marginBox) : []
      prepared.set(id, geometry)
    }
    return geometry
  }

  const features: CShapesFeature[] = []
  const eras = new Map<number, VintageEraSpec[]>()

  /** The piece of land that changed hands between two drawings, if any. */
  const changedPiece = (ours: ClipMultiPolygon, theirs: ClipMultiPolygon) =>
    ops.xor(ops.intersection(ours, frameBox), ops.intersection(theirs, frameBox)).find(piece => {
      const size = km2([piece])
      return size >= CHANGE_KM2 && (2 * size) / ringKm(piece[0]) >= CHANGE_THICK_KM
    })

  const built: { year: number; until: number; drawn: KeyframeUnit[] }[] = []
  const pool = new LinePool()
  for (const outline of outline1886.values()) pool.add(outline)
  // Newest first: each keyframe settles against the one after it.
  let next = new Map(
    [...outline1886].map(([gwcode, geometry]) => [
      gwcode,
      { geometry, source: feature1886.get(gwcode) },
    ])
  )
  for (let keyIndex = VINTAGE_KEYFRAMES.length - 1; keyIndex >= 0; keyIndex--) {
    const year = VINTAGE_KEYFRAMES[keyIndex]
    const until = (VINTAGE_KEYFRAMES[keyIndex + 1] ?? 1886) - 1
    const grouped = new Map<number, { entries: OhmIndexEntry[]; polities: KeyframePolity[] }>()
    for (const entry of picked[keyIndex]) {
      const polity = polityOf(entry)!
      const gwcode = polity.gwcode >= 0 ? polity.gwcode : autoCodes.get(entry.name)!
      const group = grouped.get(gwcode) ?? { entries: [], polities: [] }
      group.entries.push(entry)
      group.polities.push(polity)
      grouped.set(gwcode, group)
    }

    const units: KeyframeUnit[] = []
    for (const [gwcode, { entries, polities }] of grouped) {
      let geometry = ops.intersection(union(entries.map(e => preparedOf(e.id))), land)
      const lead = polities
        .map((polity, at) => ({ polity, entry: entries[at] }))
        .sort((a, b) => (b.polity.rank ?? COUNTRY) - (a.polity.rank ?? COUNTRY))[0]
      let rank = Math.max(...polities.map(polity => polity.rank ?? COUNTRY))
      const later = next.get(gwcode)
      let source: KeyframeUnit['source']
      if (later) {
        if (!changedPiece(geometry, later.geometry)) {
          geometry = later.geometry
          source = later.source
          rank = FROZEN
        }
      }
      units.push({
        gwcode,
        curated: polities.some(polity => polity.gwcode >= 0),
        ...(source ? { source } : {}),
        rank,
        geometry,
        era:
          lead.polity.sovereignFrom !== undefined && year >= lead.polity.sovereignFrom
            ? { name: lead.polity.name ?? lead.entry.name, sovereign: true }
            : {
                name: lead.polity.name ?? lead.entry.name,
                ...(lead.polity.wash ? { wash: lead.polity.wash } : {}),
                sovereign: lead.polity.sovereign ?? true,
              },
      })
    }

    for (const [code, from] of Object.entries(KEYFRAME_CARRIED_BACK)) {
      const gwcode = Number(code)
      const geometry = outline1886.get(gwcode)
      const first = VINTAGE_UNITS[gwcode]?.eras[0]
      if (year < from || !geometry || !first) continue
      const { from: _from, ...era } = first
      units.push({
        gwcode,
        curated: true,
        rank: FROZEN,
        geometry,
        source: feature1886.get(gwcode),
        era,
      })
    }

    const original = new Map(units.map(unit => [unit, unit.geometry]))
    const settleKeyframe = () => {
      const sizes = new Map(units.map(unit => [unit, km2(unit.geometry)]))
      const bounds = new Map(
        units.map(unit => {
          const box: Box = [Infinity, Infinity, -Infinity, -Infinity]
          for (const polygon of unit.geometry)
            for (const [lon, lat] of polygon[0]) {
              box[0] = Math.min(box[0], lon)
              box[1] = Math.min(box[1], lat)
              box[2] = Math.max(box[2], lon)
              box[3] = Math.max(box[3], lat)
            }
          return [unit, box]
        })
      )
      const nested = new Set<KeyframeUnit>()
      for (const inner of units)
        for (const outer of units) {
          if (inner === outer || nested.has(inner)) continue
          if (sizes.get(inner)! >= sizes.get(outer)!) continue
          const [a0, a1, a2, a3] = bounds.get(inner)!
          const [b0, b1, b2, b3] = bounds.get(outer)!
          if (a0 < b0 || a1 < b1 || a2 > b2 || a3 > b3) continue
          const shared = km2(ops.intersection(inner.geometry, outer.geometry))
          if (shared >= NESTED_SHARE * sizes.get(inner)!) nested.add(inner)
        }
      units.sort(
        (a, b) =>
          Number(nested.has(b)) - Number(nested.has(a)) ||
          b.rank - a.rank ||
          sizes.get(a)! - sizes.get(b)!
      )
      const touch = ([a0, a1, a2, a3]: Box, [b0, b1, b2, b3]: Box) =>
        a0 <= b2 && b0 <= a2 && a1 <= b3 && b1 <= a3
      const placed: KeyframeUnit[] = []
      for (const unit of units) {
        const blockers = placed.filter(
          other => other.geometry.length && touch(bounds.get(unit)!, bounds.get(other)!)
        )
        if (blockers.length && unit.geometry.length)
          unit.geometry = ops.difference(unit.geometry, ...blockers.map(other => other.geometry))
        placed.push(unit)
      }

      const drawn = units.filter(
        unit => km2(unit.geometry) >= (unit.curated ? MIN_CURATED_KM2 : MIN_KM2)
      )
      const dropped = units.filter(unit => !drawn.includes(unit))

      // Who owns each vertex, so a gap can find the neighbour it shares the
      // longest edge with.
      const owners = new Map<string, Set<number>>()
      drawn.forEach((unit, at) => {
        for (const polygon of unit.geometry)
          for (const ring of polygon)
            for (const [lon, lat] of ring) {
              const key = `${lon},${lat}`
              const set = owners.get(key) ?? new Set()
              set.add(at)
              owners.set(key, set)
            }
      })
      const gaps: ClipPolygon[] = []
      for (let tileWest = margin[0]; tileWest < margin[2]; tileWest += GAP_TILE)
        for (let tileSouth = margin[1]; tileSouth < margin[3]; tileSouth += GAP_TILE) {
          const tile: Box = [tileWest, tileSouth, tileWest + GAP_TILE, tileSouth + GAP_TILE]
          const tileLand = ops.intersection(land, boxPolygon(tile))
          if (!tileLand.length) continue
          const blockers = drawn.filter(unit => touch(bounds.get(unit)!, tile))
          gaps.push(
            ...(blockers.length
              ? ops.difference(tileLand, ...blockers.map(unit => unit.geometry))
              : tileLand)
          )
        }
      let filled = 0
      let leftKm2 = 0
      for (const gap of gaps) {
        const size = km2([gap])
        const shared = new Map<number, number>()
        for (const ring of gap)
          for (let at = 0; at + 1 < ring.length; at++) {
            const a = owners.get(`${ring[at][0]},${ring[at][1]}`)
            const b = owners.get(`${ring[at + 1][0]},${ring[at + 1][1]}`)
            if (!a || !b) continue
            const length = Math.hypot(ring[at + 1][0] - ring[at][0], ring[at + 1][1] - ring[at][1])
            for (const unit of a)
              if (b.has(unit)) shared.set(unit, (shared.get(unit) ?? 0) + length)
          }
        // A frozen polity stays exactly its later self; a sliver only frozen
        // neighbours touch stays undrawn rather than nudge one of them.
        const winner = [...shared.entries()]
          .filter(([unit]) => drawn[unit].rank !== FROZEN)
          .sort((x, y) => y[1] - x[1])[0]?.[0]
        if (winner === undefined) {
          leftKm2 += size
          continue
        }
        drawn[winner].geometry = ops.union(drawn[winner].geometry, [gap])
        filled++
      }

      const cleaned = dropStrayVertices(drawn.map(unit => unit.geometry))
      drawn.forEach((unit, at) => {
        if (unit.rank !== FROZEN) unit.geometry = cleaned[at]
      })
      return { drawn, dropped, filled, leftKm2 }
    }

    // Final against final: a polity whose settled shape differs from its
    // next one only where a dropped statelet's land or an overlap went
    // never changed, so it takes the later shape and the keyframe settles
    // again around it.
    let { drawn, dropped, filled, leftKm2 } = settleKeyframe()
    const unchanged = drawn.filter(unit => {
      const later = next.get(unit.gwcode)
      return unit.rank !== FROZEN && later && !changedPiece(unit.geometry, later.geometry)
    })
    if (unchanged.length) {
      for (const unit of units) if (unit.rank !== FROZEN) unit.geometry = original.get(unit)!
      for (const unit of unchanged) {
        const later = next.get(unit.gwcode)!
        unit.geometry = later.geometry
        unit.rank = FROZEN
        if (later.source) unit.source = later.source
      }
      ;({ drawn, dropped, filled, leftKm2 } = settleKeyframe())
    }

    report.push(
      `  ${year}: ${drawn.length} polities (${drawn.filter(unit => unit.rank === FROZEN).length} frozen), ` +
        `${filled} gaps filled, ${Math.round(leftKm2)} km² undrawn` +
        (dropped.length ? `; too small: ${dropped.map(unit => unit.era.name).join(', ')}` : '')
    )
    report.push(
      `    changed since: ${drawn
        .filter(unit => unit.rank !== FROZEN && next.has(unit.gwcode))
        .map(unit => unit.era.name)
        .join(', ')}`
    )

    for (const unit of drawn) if (unit.rank !== FROZEN) unit.geometry = pool.conflate(unit.geometry)
    for (const unit of drawn) pool.add(unit.geometry)
    next = new Map(
      drawn.map(unit => [unit.gwcode, { geometry: unit.geometry, source: unit.source }])
    )
    built.push({ year, until, drawn })
  }

  built.sort((a, b) => a.year - b.year)
  for (const { year, until, drawn } of built)
    for (const unit of drawn) {
      features.push({
        feature:
          unit.source ??
          ({
            type: 'Feature',
            properties: {},
            geometry: { type: 'MultiPolygon', coordinates: unit.geometry as Point[][][] },
          } as Feature<MultiPolygon>),
        name: unit.era.name,
        gwcode: unit.gwcode,
        start: [year, 12, 31],
        end: [until, 12, 31],
      })
      const list = eras.get(unit.gwcode) ?? []
      list.push({ from: year, ...unit.era })
      eras.set(unit.gwcode, list)
    }

  const used = new Map(picked.flat().map(entry => [entry.id, entry.name]))
  const unstitched = [...stitchLosses]
    .filter(([id]) => used.has(id))
    .map(([id, { lost, total }]) => `${used.get(id)} (${id}) ${lost}/${total} ways`)
  if (unstitched.length) report.push(`  unclosed rings: ${unstitched.join(', ')}`)
  if (skippedOperations.length)
    report.push(
      `  skipped ${skippedOperations.length} failed clips: ${skippedOperations.join('; ')}`
    )
  report.push(
    `  auto-coded: ${[...autoCodes.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([name, code]) => `${code} ${name}`)
      .join(', ')}`
  )
  return { features, eras, report }
}
