import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { geoRobinson } from 'd3-geo-projection'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import { MAP_PROJECTION } from '../../../data/map.gen'

/**
 * What the history generators share: the download cache, CShapes 2.0 (CC
 * BY-NC-SA 4.0; cite Schvitz et al. 2022, Journal of Conflict Resolution) and
 * the map's fitted Robinson. The NC licence is why its consumers stay out of
 * the CI cron.
 */

export const CSHAPES_URL = 'https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson'
const CACHE_DIR = `${import.meta.dirname}/.cache`

export type Point = [number, number]
export type DateTuple = [number, number, number]

const projection = geoRobinson().scale(MAP_PROJECTION.scale).translate(MAP_PROJECTION.translate)
export const project = ([lon, lat]: Point): Point => projection([lon, lat]) as Point

export const roundTo = (value: number, decimals = 2) => Number(value.toFixed(decimals))

export const fetchCached = async (cacheName: string, url: string): Promise<string> => {
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

export interface CShapesFeature {
  feature: Feature<Polygon | MultiPolygon>
  name: string
  gwcode: number
  start: DateTuple
  end: DateTuple
}

let cshapesFeatures: CShapesFeature[] | undefined
export const fetchCShapes = async (): Promise<CShapesFeature[]> => {
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
        ] as DateTuple,
        end: [
          Number(properties.gweyear),
          Number(properties.gwemonth),
          Number(properties.gweday),
        ] as DateTuple,
      }
    })
  return cshapesFeatures
}

export const tupleCompare = (a: DateTuple, b: DateTuple) =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

export const asPolygonRings = (geometry: Polygon | MultiPolygon): Point[][] =>
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
export const splitAtAntimeridian = (ring: Point[]): Point[][] => {
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
