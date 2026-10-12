import { MAP_PROJECTION, MAP_REGIONS } from '~~/data/map.gen'
import {
  countryLatLng,
  haversineKm,
  offsetKm,
  pointInBox,
  projectRobinson,
  type LatLng,
  type MapBox,
} from '~~/lib/geo'
import { clamp01 } from '~~/lib/number'
import type { ISOCountryCode } from '~~/types/geography.types'

export const HOT_COLD_WARMTH = { hotKm: 800, warmKm: 2500, freezingKm: 6000 } as const

export type Warmth = 'hot' | 'warm' | 'cold'

export type ProbeTrend = 'closest' | 'warmer' | 'colder'

export const warmthFor = (distanceKm: number): Warmth => {
  if (distanceKm < HOT_COLD_WARMTH.hotKm) return 'hot'
  if (distanceKm < HOT_COLD_WARMTH.warmKm) return 'warm'
  return 'cold'
}

export const temperatureFor = (distanceKm: number): string => {
  const warmth = warmthFor(distanceKm)
  if (warmth === 'hot') return 'scalding'
  if (warmth === 'warm') return 'warm'
  return distanceKm > HOT_COLD_WARMTH.freezingKm ? 'freezing' : 'cold'
}

const pointInCountry = (isoCode: ISOCountryCode, point: LatLng | undefined): point is LatLng => {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false
  if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return false
  const projected = projectRobinson(point, MAP_PROJECTION)
  return MAP_REGIONS[isoCode]?.some(ring => pointInBox(projected, ring)) ?? false
}

/**
 * Where a probe is measured from: the clicked point when it lies in one of the
 * country's ring boxes, else its centroid. A centroid alone makes a probe of
 * Russia near useless. The ring check snaps a micro-state's tap halo out of the
 * sea and stops a forged point borrowing another country's radius — per ring,
 * because France's whole bbox crosses the Atlantic and holds Germany.
 */
export const probeOrigin = (isoCode: ISOCountryCode, clicked?: LatLng): LatLng | undefined =>
  pointInCountry(isoCode, clicked) ? { lat: clicked.lat, lng: clicked.lng } : countryLatLng(isoCode)

export const probeDistanceKm = (origin: LatLng, target: ISOCountryCode): number | undefined => {
  const destination = countryLatLng(target)
  return destination ? haversineKm(origin, destination) : undefined
}

/**
 * Which way `destination` lies from `origin` ON THE DRAWN MAP, snapped to the
 * nearest of eight points (degrees clockwise from map-up). Not the
 * great-circle bearing: that reads "north" from Canada to Russia, which no
 * flat map agrees with. When the short way crosses the date line, the heading
 * aims off the nearer map edge. The needle and the search zone both read
 * this, so they can never point different ways.
 */
const mapHeading = (
  origin: LatLng,
  destination: LatLng
): { degrees: number; crossesDateLine: boolean } => {
  const span = destination.lng - origin.lng
  const crossesDateLine = Math.abs(span) > 180
  const lng = crossesDateLine ? destination.lng - Math.sign(span) * 360 : destination.lng

  const from = projectRobinson(origin, MAP_PROJECTION)
  const to = projectRobinson({ lat: destination.lat, lng }, MAP_PROJECTION)
  const raw = (Math.atan2(to.x - from.x, from.y - to.y) * 180) / Math.PI
  const degrees = (Math.round(((raw + 360) % 360) / 45) * 45) % 360
  return { degrees, crossesDateLine }
}

export const probeHeading = (
  origin: LatLng,
  target: ISOCountryCode
): { degrees: number; crossesDateLine: boolean } | undefined => {
  const destination = countryLatLng(target)
  return destination ? mapHeading(origin, destination) : undefined
}

/** How far a warmth read-out goes before it is simply "freezing". */
export const warmthFraction = (distanceKm: number): number =>
  clamp01(distanceKm / HOT_COLD_WARMTH.freezingKm)

/** The search zone's depth either side of the measured distance — the read-out
 *  says "about", so the zone is a band, not a pencil line. */
const ZONE_SPREAD = 0.12

/**
 * Where a probe says the target can be: the band at its distance, inside the
 * needle's sector — exactly what the dial and the kilometres say together,
 * drawn. Outer arc then inner arc reversed, as one ring of points; points
 * whose short way crosses the date line are dropped, so a zone never smears
 * across the whole map.
 */
export const probeZone = (origin: LatLng, distanceKm: number, degrees: number): LatLng[] => {
  const arc = (km: number) => {
    const points: LatLng[] = []
    // Swept from the far side, so the sector never straddles the start.
    for (let step = 0; step < 180; step++) {
      const bearing = (degrees + 180 + step * 2) % 360
      const point = offsetKm(origin, km, bearing)
      const heading = mapHeading(origin, point)
      if (heading.degrees === degrees && !heading.crossesDateLine) points.push(point)
    }
    return points
  }
  const outer = arc(distanceKm * (1 + ZONE_SPREAD))
  const inner = arc(Math.max(0, distanceKm * (1 - ZONE_SPREAD)))
  if (outer.length < 2) return []
  return [...outer, ...inner.reverse()]
}

/** How a probe compares with the trail before it — undefined for the first. */
export const probeTrend = (
  distanceKm: number,
  previous?: { lastKm: number; bestKm: number }
): { trend: ProbeTrend; deltaKm: number } | undefined => {
  if (!previous) return undefined
  const deltaKm = Math.abs(distanceKm - previous.lastKm)
  if (distanceKm < previous.bestKm) return { trend: 'closest', deltaKm }
  if (distanceKm < previous.lastKm) return { trend: 'warmer', deltaKm }
  return { trend: 'colder', deltaKm }
}

export interface HotColdProbe {
  isoCode: ISOCountryCode
  /** Absent only when neither the click nor the Factbook can place the country. */
  origin?: LatLng
  distanceKm: number
  warmth: Warmth
  /** Map heading to the target — absent on the probe that found it. */
  degrees?: number
  crossesDateLine?: boolean
  trend?: ProbeTrend
  /** Free re-clicks of this country since it was probed. */
  replays: number
}

/** The map-space box around every probe and its search zone — what a small
 *  screen frames, so the trail is never a postage stamp. It shows nothing
 *  the zones don't already draw. */
export const probeFrame = (probes: HotColdProbe[]): MapBox | undefined => {
  const points = probes.flatMap(probe => {
    if (!probe.origin) return []
    const zone =
      probe.degrees === undefined ? [] : probeZone(probe.origin, probe.distanceKm, probe.degrees)
    return [probe.origin, ...zone].map(point => projectRobinson(point, MAP_PROJECTION))
  })
  if (!points.length) return undefined
  const xs = points.map(point => point.x)
  const ys = points.map(point => point.y)
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)]
  return [minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY]
}
