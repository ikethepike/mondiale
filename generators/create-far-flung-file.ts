/**
 * Far Flung: resolve each editorial seed (generators/data/far-flung-seeds.ts)
 * to the projected map ring that contains its anchor, and emit the ring as a
 * standalone path the gate can stage on its own.
 *
 * Rings come from data/map.gen.ts (MAP_PATHS, falling back to MAP_PATHS_HD
 * for fragments the simplified tier collapses). A seed whose ring is missing
 * or smaller than the visibility floor is dropped with a warning — never
 * emitted invisibly small.
 *
 * Run: bun run generators/create-far-flung-file.ts
 */
import { writeFileSync } from 'fs'
import { join } from 'path'
import { MAP_PATHS, MAP_PROJECTION } from '../data/map.gen'
import { MAP_PATHS_HD } from '../data/map-hd.gen'
import { haversineKm, invertRobinson, projectRobinson } from '../lib/geo'
import { mentionsCountry } from '../lib/country'
import { FAR_FLUNG_SEEDS } from './data/far-flung-seeds'
import type { ISOCountryCode } from '../types/geography.types'

export interface FarFlungEntry {
  iso: ISOCountryCode
  /** The fragment's own name — "Cabinda". */
  name: string
  /** One reveal line; owner-free by construction (mentionsCountry-checked). */
  blurb: string
  /** The fragment's ring alone, absolute path in map viewBox space. */
  d: string
  /** [x, y, width, height] of the ring in map viewBox space. */
  bounds: [number, number, number, number]
  /** Great-circle distance from the fragment to the country's main landmass. */
  separationKm: number
}

export type FarFlungMapping = { [slug: string]: FarFlungEntry }

type Point = [number, number]

/** Parse a country path (absolute `M x,y` + relative `l dx,dy` runs, `z`
 *  closes) into its rings as point lists. */
const ringsOf = (d: string): Point[][] => {
  const rings: Point[][] = []
  const re = /([Mlz])|(-?\d+\.?\d*),(-?\d+\.?\d*)/g
  let command: string | null = null
  let x = 0
  let y = 0
  let current: Point[] | null = null
  let match: RegExpExecArray | null
  while ((match = re.exec(d))) {
    if (match[1]) {
      command = match[1]
      if (command === 'z' && current) {
        rings.push(current)
        current = null
      }
      continue
    }
    const a = Number(match[2])
    const b = Number(match[3])
    if (command === 'M') {
      x = a
      y = b
      current = [[x, y]]
      command = 'l'
    } else {
      x += a
      y += b
      current?.push([x, y])
    }
  }
  if (current) rings.push(current)
  return rings
}

const boundsOf = (ring: Point[]): [number, number, number, number] => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of ring) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return [minX, minY, maxX - minX, maxY - minY]
}

/** Ray-cast point-in-polygon. */
const contains = (ring: Point[], x: number, y: number): boolean => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const diagonal = (ring: Point[]): number => {
  const [, , width, height] = boundsOf(ring)
  return Math.hypot(width, height)
}

/** The anchor's ring: containing if any, else nearest within a slack radius
 *  (a coastal anchor can fall just outside a heavily simplified ring). */
const NEAR_SLACK_UNITS = 3
const ringFor = (rings: Point[][], x: number, y: number): Point[] | undefined => {
  const containing = rings.find(ring => contains(ring, x, y))
  if (containing) return containing
  // A coastal anchor can fall just outside a heavily simplified ring — but a
  // FRAGMENT is never the country's largest ring, so the mainland is barred
  // from the fallback (Ceuta's anchor sits a strait's width from Iberia).
  const largest = [...rings].sort((a, b) => diagonal(b) - diagonal(a))[0]
  let best: { ring: Point[]; gap: number } | undefined
  for (const ring of rings) {
    if (ring === largest) continue
    for (const [px, py] of ring) {
      const gap = Math.hypot(px - x, py - y)
      if (gap < (best?.gap ?? NEAR_SLACK_UNITS)) best = { ring, gap }
    }
  }
  return best?.ring
}

const round2 = (value: number) => Math.round(value * 100) / 100

const pathOf = (ring: Point[]): string =>
  `M ${ring.map(([x, y]) => `${round2(x)},${round2(y)}`).join(' L ')} Z`

/** Nearest great-circle distance between two rings, over their vertices. */
const ringSeparationKm = (a: Point[], b: Point[]): number => {
  let best = Infinity
  // Sample the larger ring so a 2,000-vertex HD coastline stays cheap.
  const sample = (ring: Point[]) =>
    ring.filter((_, index) => index % Math.max(1, Math.floor(ring.length / 200)) === 0)
  for (const [ax, ay] of sample(a)) {
    const from = invertRobinson(ax, ay, MAP_PROJECTION)
    if (!from) continue
    for (const [bx, by] of sample(b)) {
      const to = invertRobinson(bx, by, MAP_PROJECTION)
      if (!to) continue
      best = Math.min(best, haversineKm(from, to))
    }
  }
  return best
}

/** Below this the fragment renders as noise even with the camera on it. */
const VISIBILITY_FLOOR_UNITS = 1.2

const entries: FarFlungMapping = {}
for (const seed of FAR_FLUNG_SEEDS) {
  if (mentionsCountry(seed.blurb, seed.iso)) {
    throw new Error(`far-flung: blurb for ${seed.slug} names its own country`)
  }
  const { x, y } = projectRobinson(seed.anchor, MAP_PROJECTION)

  // Prefer the standard tier; fall back to HD when the simplified ring is
  // missing or below the floor (the Azores survive only in HD).
  let ring: Point[] | undefined
  for (const paths of [MAP_PATHS, MAP_PATHS_HD]) {
    const d = (paths as Partial<Record<ISOCountryCode, string>>)[seed.iso]
    if (!d) continue
    const candidate = ringFor(ringsOf(d), x, y)
    if (candidate && diagonal(candidate) >= VISIBILITY_FLOOR_UNITS) {
      ring = candidate
      break
    }
    ring ??= candidate
  }
  if (!ring) {
    console.warn(`far-flung: DROPPED ${seed.slug} — no ring holds ${seed.anchor.lat},${seed.anchor.lng}`)
    continue
  }
  if (diagonal(ring) < VISIBILITY_FLOOR_UNITS) {
    console.warn(`far-flung: DROPPED ${seed.slug} — ring diagonal ${diagonal(ring).toFixed(2)} under floor`)
    continue
  }

  // The fragment must not BE the whole country: the main landmass is the
  // largest ring that isn't the fragment itself (East Malaysia inverts this —
  // its fragment IS the largest ring, and "home" is the biggest other one).
  const allRings = ringsOf(MAP_PATHS[seed.iso]!)
  const others = allRings
    .filter(candidate => diagonal(candidate) > 0)
    .filter(candidate => {
      const [bx, by] = boundsOf(candidate)
      const [rx, ry] = boundsOf(ring!)
      return Math.abs(bx - rx) > 0.01 || Math.abs(by - ry) > 0.01
    })
    .sort((a, b) => diagonal(b) - diagonal(a))
  const home = others[0]
  const separationKm = home ? Math.round(ringSeparationKm(ring, home)) : 0

  entries[seed.slug] = {
    iso: seed.iso,
    name: seed.name,
    blurb: seed.blurb,
    d: pathOf(ring),
    bounds: boundsOf(ring).map(round2) as [number, number, number, number],
    separationKm,
  }
}

const kept = Object.keys(entries).length
if (kept < 12) throw new Error(`far-flung: only ${kept} seeds survived — expected a playable pool`)

const output = `// Generated by generators/create-far-flung-file.ts — do not edit by hand.
import type { FarFlungMapping } from '../generators/create-far-flung-file'
export const FAR_FLUNG: FarFlungMapping = JSON.parse(${JSON.stringify(JSON.stringify(entries))})
`
writeFileSync(join(import.meta.dirname, '../data/far-flung.gen.ts'), output)
console.log(`Wrote data/far-flung.gen.ts (${kept}/${FAR_FLUNG_SEEDS.length} seeds)`)
