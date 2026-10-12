import type { TerrainEntry } from '../../data/static/terrain-roster'
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

export const roundTo = (value: number, decimals = 2) => Number(value.toFixed(decimals))

export const boundsOf = (pointGroups: OutlinePoint[][]): WaterBounds => {
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

export const boundsOverlap = (
  [ax, ay, aw, ah]: WaterBounds,
  [bx, by, bw, bh]: WaterBounds,
  pad = 0
) => ax <= bx + bw + pad && ax + aw >= bx - pad && ay <= by + bh + pad && ay + ah >= by - pad

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

/** Even-odd over every ring, so a hole (an island in a sea, a lake in a country) is outside. */
export const pointInRings = (point: OutlinePoint, rings: OutlinePoint[][]): boolean =>
  rings.reduce((inside, ring) => (ringContains(ring, point) ? !inside : inside), false)

/** `source` drawn into `target`, its countries appended in their own order. */
export const absorbFeature = (target: WaterKey, source: WaterKey) => {
  target.d = `${target.d} ${source.d}`
  target.bounds = unionBounds(target.bounds, source.bounds)
  target.countries = [
    ...target.countries,
    ...source.countries.filter(code => !target.countries.includes(code)),
  ]
}

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

/**
 * The countries a body of water touches: their land comes within `epsilon` of
 * the water's outline, measured edge to edge rather than vertex to vertex, or
 * one outline sits wholly inside the other — an island in a sea (Malta lies
 * inside the Mediterranean and near none of its vertices), a lake inside a
 * country (Ladoga's nearest Russian edge is the Finnish border).
 */
export const createShoreTest = (lands: ShoreLand[], epsilon: number, cell = 4) => {
  const shapes = lands.map(land => ({ ...land, bounds: boundsOf(land.rings) }))
  const landEdgesNear = segmentGrid(
    shapes.map(({ code, rings }) => ({ owner: code, rings })),
    epsilon,
    cell
  )

  return (water: OutlinePoint[][]): Set<ISOCountryCode> => {
    const found = new Set<ISOCountryCode>()
    const bounds = boundsOf(water)
    const candidates = shapes.filter(shape => boundsOverlap(shape.bounds, bounds, epsilon))

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
        shape.rings.some(ring => ring.length && pointInRings(ring[0], water)) ||
        water.some(ring => ring.length && pointInRings(ring[0], shape.rings))
      if (touches) found.add(shape.code)
    }
    return found
  }
}

const applyShoreCorrections = (
  features: Record<string, WaterKey>,
  corrections: [string, ShoreCorrection][]
): string[] => {
  const stale: string[] = []
  for (const [id, { include = [], exclude = [] }] of corrections) {
    const feature = features[id]
    if (!feature) {
      stale.push(`${id}: no such feature`)
      continue
    }
    for (const code of include)
      if (feature.countries.includes(code)) stale.push(`${id}: already includes ${code}`)
    for (const code of exclude)
      if (!feature.countries.includes(code)) stale.push(`${id}: already lacks ${code}`)
    feature.countries = [
      ...new Set([...feature.countries.filter(code => !exclude.includes(code)), ...include]),
    ].sort()
  }
  return stale
}

/**
 * Settle the area answer keys in place. Each named arm is folded into the sea
 * it belongs to — the whole draws the arm and lists its shores, and the arm
 * still deals as itself (NE cuts the Adriatic and the Alboran out of the
 * Mediterranean polygon, which left Croatia and Morocco off it). An arm's
 * corrections land before the fold, so they carry into its whole; every other
 * correction lands after, so a whole's exclude is never undone by an arm.
 * Returns one line per entry that no longer does anything — a missing feature,
 * an include already there, an exclude already gone — so an NE bump that fixes
 * the geometry retires its own corrections instead of leaving dead rows.
 */
export const settleWaterKeys = (
  features: Record<string, WaterKey>,
  parts: Record<string, string[]>,
  corrections: Record<string, ShoreCorrection>
): string[] => {
  const arms = new Set(Object.values(parts).flat())
  const entries = Object.entries(corrections)
  const stale = applyShoreCorrections(
    features,
    entries.filter(([id]) => arms.has(id))
  )
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
      absorbFeature(whole, part)
    }
    whole.countries.sort()
  }
  stale.push(
    ...applyShoreCorrections(
      features,
      entries.filter(([id]) => !arms.has(id))
    )
  )
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

type Stampable = Pick<
  WaterFeature,
  'id' | 'name' | 'aliases' | 'countries' | 'fame' | 'accepted' | 'bare'
>

/** What a subject's geometry and its hand-written key disagree on, for the report. */
export interface TerrainDisagreement {
  id: string
  /** Curated (required or accepted) but not where the geometry puts the subject. */
  unseen: ISOCountryCode[]
  /** Where the geometry puts the subject, but on neither curated list. */
  unlisted: ISOCountryCode[]
}

/**
 * Stamp the curated roster onto the generated features in place: the key, the
 * free tier, the fame tier, the headline. Throws on any entry that cannot be
 * stamped honestly; returns the geometry's disagreements, which are the
 * report's business, not an error — the hand-written key is the answer.
 */
export const stampTerrainRoster = (
  features: Record<string, Stampable>,
  roster: Record<string, TerrainEntry>,
  countryCodes: readonly ISOCountryCode[],
  minimumKey: number
): TerrainDisagreement[] => {
  const known = new Set(countryCodes)
  const faults: string[] = []
  const disagreements: TerrainDisagreement[] = []

  for (const [id, entry] of Object.entries(roster)) {
    const feature = features[id]
    if (!feature) {
      faults.push(`${id}: no such feature`)
      continue
    }
    const accepted = entry.accepted ?? []
    const listed = [...entry.required, ...accepted]
    const unknown = listed.filter(code => !known.has(code))
    const twice = listed.filter((code, index) => listed.indexOf(code) !== index)
    if (unknown.length) faults.push(`${id}: unknown countries ${unknown.join(',')}`)
    if (twice.length) faults.push(`${id}: listed twice ${twice.join(',')}`)
    if (entry.required.length < minimumKey)
      faults.push(`${id}: ${entry.required.length} required, a sweep needs ${minimumKey}`)

    const unseen = listed.filter(code => !feature.countries.includes(code))
    const unlisted = feature.countries.filter(code => !listed.includes(code))
    if (unseen.length || unlisted.length) disagreements.push({ id, unseen, unlisted })

    const name = entry.name ?? feature.name
    const aliases = [
      ...new Set([...(feature.aliases ?? []), feature.name, ...(entry.aliases ?? [])]),
    ].filter(alias => alias !== name)
    feature.name = name
    if (aliases.length) feature.aliases = aliases
    feature.countries = [...entry.required]
    feature.fame = entry.fame
    if (accepted.length) feature.accepted = [...accepted]
    if (entry.bare) feature.bare = true
  }

  if (faults.length) throw new Error(`terrain roster:\n  ${faults.join('\n  ')}`)
  return disagreements
}
