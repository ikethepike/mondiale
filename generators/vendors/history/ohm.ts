import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import polygonClipping, { type MultiPolygon as ClipMultiPolygon } from 'polygon-clipping'
import type { DateTuple, Point } from './cshapes'

/**
 * OpenHistoricalMap (CC0; a handful of ways carry CC BY 4.0) — the borders
 * before CShapes begins. Country-level relations are dated to the day with
 * `start_date`/`end_date`; Overpass serves them, and every response is cached.
 */

const OVERPASS = 'https://overpass-api.openhistoricalmap.org/api/interpreter'
const CACHE_DIR = `${import.meta.dirname}/.cache/ohm`

export interface OhmIndexEntry {
  id: number
  name: string
  level: number
  start?: DateTuple
  end?: DateTuple
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number }
  licence?: string
}

const overpass = async (query: string): Promise<unknown> => {
  const response = await fetch(OVERPASS, {
    method: 'POST',
    body: new URLSearchParams({ data: query }),
  })
  if (!response.ok) throw new Error(`Overpass failed: ${response.status}`)
  return response.json()
}

const cachedOverpass = async (cacheName: string, query: string): Promise<unknown> => {
  const path = `${CACHE_DIR}/${cacheName}`
  if (!existsSync(path)) {
    console.info(`Overpass: ${cacheName}`)
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(path, JSON.stringify(await overpass(query)))
  }
  return JSON.parse(readFileSync(path, 'utf-8'))
}

/** "1793-07-23", "1810", "-0044-03" → a tuple; months and days default to the
 *  start of the period. */
export const ohmDate = (value: string | undefined): DateTuple | undefined => {
  const match = value?.match(/^(-?\d{1,4})(?:-(\d{2}))?(?:-(\d{2}))?/)
  if (!match) return undefined
  return [Number(match[1]), Number(match[2] ?? 1), Number(match[3] ?? 1)]
}

interface OverpassElement {
  type: string
  id: number
  tags?: Record<string, string>
  bounds?: OhmIndexEntry['bounds']
  members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[]
}

/** Every country- and province-level relation touching `bbox` (S, W, N, E). */
export const fetchOhmIndex = async (
  bbox: [number, number, number, number],
  levels: number[]
): Promise<OhmIndexEntry[]> => {
  const entries: OhmIndexEntry[] = []
  for (const level of levels) {
    const data = (await cachedOverpass(
      `index-${level}-${bbox.join('_')}.json`,
      `[out:json][timeout:600];rel["boundary"="administrative"]["admin_level"="${level}"](${bbox.join(',')});out tags bb;`
    )) as { elements: OverpassElement[] }
    for (const element of data.elements) {
      const tags = element.tags ?? {}
      entries.push({
        id: element.id,
        name: tags['name:en'] ?? tags.name ?? '',
        level,
        start: ohmDate(tags.start_date),
        end: ohmDate(tags.end_date),
        bounds: element.bounds,
        licence: tags.license,
      })
    }
  }
  return entries
}

/** How far apart two way ends may sit and still be joined — OpenHistoricalMap
 *  relations are not always noded, and a ring that cannot close is lost. */
const JOIN_DEGREES = 0.02

const ringsFromWays = (ways: Point[][]): Point[][] => {
  const open = ways.filter(way => way.length >= 2).map(way => [...way])
  const gap = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])
  const rings: Point[][] = []
  while (open.length) {
    const ring = open.shift()!
    for (;;) {
      const head = ring[0]
      const tail = ring[ring.length - 1]
      if (ring.length > 2 && gap(head, tail) === 0) break
      let best = -1
      let bestGap = JOIN_DEGREES
      let flip = false
      open.forEach((way, at) => {
        const toStart = gap(way[0], tail)
        const toEnd = gap(way[way.length - 1], tail)
        if (toStart < bestGap) [best, bestGap, flip] = [at, toStart, false]
        if (toEnd < bestGap) [best, bestGap, flip] = [at, toEnd, true]
      })
      if (best >= 0 && bestGap <= gap(head, tail)) {
        const [way] = open.splice(best, 1)
        const next = flip ? way.reverse() : way
        ring.push(...(gap(next[0], tail) === 0 ? next.slice(1) : next))
        continue
      }
      if (gap(head, tail) < JOIN_DEGREES * 5) ring.push(head)
      break
    }
    if (ring.length >= 4 && gap(ring[0], ring[ring.length - 1]) === 0) rings.push(ring)
  }
  return rings
}

/** A relation's members stitched into polygons: outers unioned, inners cut. */
export const relationGeometry = (element: OverpassElement): ClipMultiPolygon => {
  const waysOf = (role: string) =>
    (element.members ?? [])
      .filter(member => member.type === 'way' && member.role === role && member.geometry)
      .map(member => member.geometry!.map(({ lon, lat }): Point => [lon, lat]))
  const outers = ringsFromWays([...waysOf('outer'), ...waysOf('')])
  const inners = ringsFromWays(waysOf('inner'))
  if (!outers.length) return []
  const [first, ...rest] = outers.map(ring => [[ring]] as ClipMultiPolygon)
  const shell = polygonClipping.union(first, ...rest)
  return inners.length
    ? polygonClipping.difference(shell, ...inners.map(ring => [[ring]] as ClipMultiPolygon))
    : shell
}

/** Relations with full geometry, fetched in batches and cached one by one. */
export const fetchOhmGeometries = async (ids: number[]): Promise<Map<number, ClipMultiPolygon>> => {
  const geometries = new Map<number, ClipMultiPolygon>()
  const missing = ids.filter(id => !existsSync(`${CACHE_DIR}/rel-${id}.json`))
  for (let start = 0; start < missing.length; start += 12) {
    const batch = missing.slice(start, start + 12)
    console.info(`Overpass: ${batch.length} relations (${start + batch.length}/${missing.length})`)
    const data = (await overpass(
      `[out:json][timeout:900];rel(id:${batch.join(',')});out geom;`
    )) as { elements: OverpassElement[] }
    mkdirSync(CACHE_DIR, { recursive: true })
    for (const element of data.elements)
      writeFileSync(`${CACHE_DIR}/rel-${element.id}.json`, JSON.stringify(element))
  }
  for (const id of ids) {
    const path = `${CACHE_DIR}/rel-${id}.json`
    if (!existsSync(path)) throw new Error(`OHM relation ${id} did not download`)
    geometries.set(id, relationGeometry(JSON.parse(readFileSync(path, 'utf-8'))))
  }
  return geometries
}
