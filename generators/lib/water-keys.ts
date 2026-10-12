import type { RosterExpectation, ShoreCorrection } from '../../data/static/water-shore-corrections'
import type { WaterFeature } from '../../data/water.gen'
import { ringContains, segmentDistance, type OutlinePoint } from '../../lib/outline'
import type { ISOCountryCode } from '../../types/geography.types'

export type WaterBounds = WaterFeature['bounds']

export interface ShoreLand {
  code: ISOCountryCode
  rings: OutlinePoint[][]
}

export type WaterKey = Pick<WaterFeature, 'id' | 'd' | 'bounds' | 'countries'>

const roundTo = (value: number, decimals = 2) => Number(value.toFixed(decimals))

export const unionBounds = (
  [ax, ay, aw, ah]: WaterBounds,
  [bx, by, bw, bh]: WaterBounds
): WaterBounds => {
  const minX = Math.min(ax, bx)
  const minY = Math.min(ay, by)
  return [
    minX,
    minY,
    roundTo(Math.max(ax + aw, bx + bw) - minX),
    roundTo(Math.max(ay + ah, by + bh) - minY),
  ]
}

type Extent = [number, number, number, number]

const extentOf = (rings: OutlinePoint[][]): Extent => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of rings)
    for (const [x, y] of ring) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  return [minX, minY, maxX, maxY]
}

const extentsMeet = (a: Extent, b: Extent, pad: number) =>
  a[0] <= b[2] + pad && a[2] >= b[0] - pad && a[1] <= b[3] + pad && a[3] >= b[1] - pad

interface Segment<T> {
  owner: T
  a: OutlinePoint
  b: OutlinePoint
}

/** Every ring edge, filed under each grid cell its box (grown by `reach`) covers,
 *  so one cell lookup finds every edge within `reach` of a point in that cell. */
const segmentGrid = <T>(
  owned: { owner: T; rings: OutlinePoint[][] }[],
  reach: number,
  cell: number
) => {
  const grid = new Map<string, Segment<T>[]>()
  for (const { owner, rings } of owned)
    for (const ring of rings)
      for (let index = 0; index < ring.length; index++) {
        const a = ring[index]
        const b = ring[(index + 1) % ring.length]
        const fromX = Math.floor((Math.min(a[0], b[0]) - reach) / cell)
        const toX = Math.floor((Math.max(a[0], b[0]) + reach) / cell)
        const fromY = Math.floor((Math.min(a[1], b[1]) - reach) / cell)
        const toY = Math.floor((Math.max(a[1], b[1]) + reach) / cell)
        for (let x = fromX; x <= toX; x++)
          for (let y = fromY; y <= toY; y++) {
            const key = `${x}:${y}`
            const bucket = grid.get(key)
            if (bucket) bucket.push({ owner, a, b })
            else grid.set(key, [{ owner, a, b }])
          }
      }
  return (point: OutlinePoint) =>
    grid.get(`${Math.floor(point[0] / cell)}:${Math.floor(point[1] / cell)}`) ?? []
}

/** Even-odd over every ring, so a hole (an island in a sea, a lake in a country) is outside. */
const insideRings = (rings: OutlinePoint[][], point: OutlinePoint) =>
  rings.reduce((inside, ring) => (ringContains(ring, point) ? !inside : inside), false)

/**
 * The countries a body of water touches: their land comes within `epsilon` of
 * the water's outline, measured edge to edge rather than vertex to vertex, or
 * one outline sits wholly inside the other — an island in a sea (Malta lies
 * inside the Mediterranean and near none of its vertices), a lake inside a
 * country (Ladoga's nearest Russian edge is the Finnish border).
 */
export const createShoreTest = (lands: ShoreLand[], epsilon: number, cell = 4) => {
  const shapes = lands.map(land => ({ ...land, extent: extentOf(land.rings) }))
  const landEdgesNear = segmentGrid(
    shapes.map(({ code, rings }) => ({ owner: code, rings })),
    epsilon,
    cell
  )

  return (water: OutlinePoint[][]): Set<ISOCountryCode> => {
    const found = new Set<ISOCountryCode>()
    const extent = extentOf(water)
    const candidates = shapes.filter(shape => extentsMeet(shape.extent, extent, epsilon))

    for (const ring of water)
      for (const point of ring)
        for (const { owner, a, b } of landEdgesNear(point)) {
          if (!found.has(owner) && segmentDistance(point[0], point[1], a, b) <= epsilon)
            found.add(owner)
        }

    const waterEdgesNear = segmentGrid([{ owner: true, rings: water }], epsilon, cell)
    for (const shape of candidates) {
      if (found.has(shape.code)) continue
      const touches =
        shape.rings.some(ring =>
          ring.some(point =>
            waterEdgesNear(point).some(
              ({ a, b }) => segmentDistance(point[0], point[1], a, b) <= epsilon
            )
          )
        ) ||
        shape.rings.some(ring => ring.length && insideRings(water, ring[0])) ||
        water.some(ring => ring.length && insideRings(shape.rings, ring[0]))
      if (touches) found.add(shape.code)
    }
    return found
  }
}

const sortedUnion = (a: ISOCountryCode[], b: ISOCountryCode[]) => [...new Set([...a, ...b])].sort()

/**
 * Apply the curated shore overlay in place. Returns one line per entry that no
 * longer does anything — a missing feature, an include already there, an
 * exclude already gone — so an NE bump that fixes the geometry retires its
 * own corrections instead of leaving dead rows.
 */
export const applyShoreCorrections = (
  features: Record<string, WaterKey>,
  corrections: Record<string, ShoreCorrection>
): string[] => {
  const stale: string[] = []
  for (const [id, { include = [], exclude = [] }] of Object.entries(corrections)) {
    const feature = features[id]
    if (!feature) {
      stale.push(`${id}: no such feature`)
      continue
    }
    for (const code of include)
      if (feature.countries.includes(code)) stale.push(`${id}: already includes ${code}`)
    for (const code of exclude)
      if (!feature.countries.includes(code)) stale.push(`${id}: already lacks ${code}`)
    feature.countries = sortedUnion(
      feature.countries.filter(code => !exclude.includes(code)),
      include
    )
  }
  return stale
}

/**
 * Fold each named arm into the sea it belongs to: the whole draws the arm and
 * lists its shores, and the arm still deals as itself. NE cuts the Adriatic,
 * the Alboran and the rest out of the Mediterranean polygon, which is what
 * left Croatia and Morocco off the Mediterranean.
 */
export const foldWaterParts = (
  features: Record<string, WaterKey>,
  parts: Record<string, string[]>
): string[] => {
  const stale: string[] = []
  for (const [wholeId, partIds] of Object.entries(parts)) {
    const whole = features[wholeId]
    if (!whole) {
      stale.push(`${wholeId}: no such feature`)
      continue
    }
    for (const partId of partIds) {
      if (parts[partId])
        throw new Error(
          `water parts: ${partId} is itself a whole — list its parts under ${wholeId}`
        )
      const part = features[partId]
      if (!part) {
        stale.push(`${wholeId}: no such part ${partId}`)
        continue
      }
      whole.d = `${whole.d} ${part.d}`
      whole.bounds = unionBounds(whole.bounds, part.bounds)
      whole.countries = sortedUnion(whole.countries, part.countries)
    }
  }
  return stale
}

/** Each expectation that the shipped key breaks, worded for a thrown error. */
export const rosterDrift = (
  features: Record<string, Pick<WaterKey, 'countries'>>,
  expectations: Record<string, RosterExpectation>
): string[] =>
  Object.entries(expectations).flatMap(([id, { includes, excludes }]) => {
    const feature = features[id]
    if (!feature) return [`${id} no longer deals`]
    const missing = includes.filter(code => !feature.countries.includes(code))
    const surplus = excludes.filter(code => feature.countries.includes(code))
    if (!missing.length && !surplus.length) return []
    return [
      `${id} (${feature.countries.join(' ')})` +
        `${missing.length ? ` — missing ${missing.join(',')}` : ''}` +
        `${surplus.length ? ` — should not include ${surplus.join(',')}` : ''}`,
    ]
  })
