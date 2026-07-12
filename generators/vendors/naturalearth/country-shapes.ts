import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { geoContains, geoDistance } from 'd3-geo'
import type { Feature, FeatureCollection } from 'geojson'

/**
 * Country polygons in lat/lng, for asking "does this point lie in that
 * country?". Backs the coordinate sanity-check in create-landmarks-file.
 *
 * This deliberately does NOT reuse create-map's unit filter. That generator
 * drops far-flung territories (French Polynesia, Puerto Rico, Gibraltar…)
 * because merging them would explode a country's bounding box and wreck camera
 * framing. For validation we want the opposite: every territory's real polygon,
 * so a landmark sitting on one is recognised rather than flagged.
 */

const NE_TAG = 'v5.1.2'
const NE_FILE = 'ne_10m_admin_0_map_units'
const CACHE_DIR = 'generators/vendors/naturalearth/.cache'
const CACHE_FILE = `${CACHE_DIR}/${NE_FILE}.geojson`
const NE_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_TAG}/geojson/${NE_FILE}.geojson`

const EARTH_RADIUS_KM = 6371

/**
 * NE units whose ISO_A2 is `-99`. Same mapping create-map uses — a unit that
 * belongs inside a host country's shape rather than standing alone.
 */
const UNIT_OVERRIDES: Record<string, string> = {
  KOS: 'XK', // Kosovo
  SOL: 'SO', // Somaliland — NE splits it out
  CYN: 'CY', // Northern Cyprus
  ESB: 'CY', // Dhekelia (UK base)
  WSB: 'CY', // Akrotiri (UK base)
  CNM: 'CY', // Cyprus UN buffer zone
  KNX: 'KR', // Korean DMZ (south)
  KNZ: 'KP', // Korean DMZ (north)
  USG: 'CU', // Guantanamo Bay
  KAS: 'IN', // Siachen Glacier
  SPI: 'CL', // Southern Patagonian Ice Field
  BRT: 'EG', // Bir Tawil
}

const resolveCode = (properties: Record<string, unknown>): string | undefined => {
  const unit = String(properties.GU_A3 ?? properties.ADM0_A3)
  const override = UNIT_OVERRIDES[unit]
  if (override) return override
  // ISO_A2 is `-99` for 61 of the 298 units; the _EH variant fills most in.
  for (const field of ['ISO_A2_EH', 'ISO_A2']) {
    const value = String(properties[field])
    if (/^[A-Z]{2}$/.test(value)) return value
  }
  return undefined
}

const fetchSource = async (): Promise<FeatureCollection> => {
  if (!existsSync(CACHE_FILE)) {
    console.info(`Downloading ${NE_URL}`)
    const response = await fetch(NE_URL)
    if (!response.ok) throw new Error(`Natural Earth download failed: ${response.status}`)
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(CACHE_FILE, await response.text())
  }
  return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'))
}

export interface CountryShapes {
  /** True when the point lies inside any of the country's polygons. */
  contains(isoCode: string, lat: number, lng: number): boolean
  /** Great-circle km from the point to the country's nearest border vertex. */
  distanceToBorderKm(isoCode: string, lat: number, lng: number): number
  /** Whether we hold any polygon for this country at all. */
  has(isoCode: string): boolean
  /** Every boundary vertex of the country's polygons, as [lng, lat]. */
  boundaryVertices(isoCode: string): Generator<[number, number]>
}

export const loadCountryShapes = async (): Promise<CountryShapes> => {
  const collection = await fetchSource()

  const byIso = new Map<string, Feature[]>()
  for (const feature of collection.features) {
    const code = resolveCode(feature.properties ?? {})
    if (!code) continue
    const existing = byIso.get(code)
    if (existing) existing.push(feature)
    else byIso.set(code, [feature])
  }

  const ringsOf = function* (isoCode: string): Generator<[number, number]> {
    for (const feature of byIso.get(isoCode) ?? []) {
      const geometry = feature.geometry
      if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') continue
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
      for (const polygon of polygons) {
        for (const ring of polygon) {
          for (const position of ring) yield position as [number, number]
        }
      }
    }
  }

  return {
    has: isoCode => byIso.has(isoCode),

    boundaryVertices: ringsOf,

    contains: (isoCode, lat, lng) =>
      (byIso.get(isoCode) ?? []).some(feature => geoContains(feature, [lng, lat])),

    distanceToBorderKm: (isoCode, lat, lng) => {
      let nearest = Infinity
      for (const vertex of ringsOf(isoCode)) {
        const km = geoDistance([lng, lat], vertex) * EARTH_RADIUS_KM
        if (km < nearest) nearest = km
      }
      return nearest
    },
  }
}
