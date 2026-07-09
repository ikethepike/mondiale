import { COUNTRIES } from '~~/data/countries.gen'
import type { ISOCountryCode } from '~~/types/geography.types'

export interface LatLng {
  lat: number
  lng: number
}

/** Parse the factbook coordinate strings, e.g. "62 00 N, 15 00 E". */
export const parseCoordinates = (raw: string | undefined): LatLng | undefined => {
  if (!raw) return undefined
  const match = raw.match(/(\d+)\s+(\d+)\s*([NS])\s*,\s*(\d+)\s+(\d+)\s*([EW])/i)
  if (!match) return undefined

  const lat = (Number(match[1]) + Number(match[2]) / 60) * (match[3].toUpperCase() === 'S' ? -1 : 1)
  const lng = (Number(match[4]) + Number(match[5]) / 60) * (match[6].toUpperCase() === 'W' ? -1 : 1)
  return { lat, lng }
}

export const countryLatLng = (isoCode: ISOCountryCode): LatLng | undefined =>
  parseCoordinates(COUNTRIES[isoCode]?.coordinates)

const toRadians = (degrees: number) => (degrees * Math.PI) / 180
const toDegrees = (radians: number) => (radians * 180) / Math.PI

/** Great-circle distance in kilometres. */
export const haversineKm = (a: LatLng, b: LatLng): number => {
  const earthRadiusKm = 6371
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Initial bearing from a to b, degrees clockwise from north. */
export const bearingDegrees = (a: LatLng, b: LatLng): number => {
  const dLng = toRadians(b.lng - a.lng)
  const y = Math.sin(dLng) * Math.cos(toRadians(b.lat))
  const x =
    Math.cos(toRadians(a.lat)) * Math.sin(toRadians(b.lat)) -
    Math.sin(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.cos(dLng)
  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}

const COMPASS_POINTS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
]

export const compassLabel = (bearing: number): string =>
  COMPASS_POINTS[Math.round(bearing / 45) % 8]
