import { describe, expect, it } from 'vitest'
import { COUNTRIES } from '~~/data/countries.gen'
import { compassLabel, countryLatLng } from '~~/lib/geo'
import {
  HOT_COLD_WARMTH,
  probeDistanceKm,
  probeHeading,
  probeOrigin,
  probeTrend,
  temperatureFor,
  warmthFor,
} from '~~/lib/hot-cold'
import type { ISOCountryCode } from '~~/types/geography.types'

const centroid = (isoCode: ISOCountryCode) => countryLatLng(isoCode)!
const MOSCOW = { lat: 55.75, lng: 37.62 }

describe('probeHeading', () => {
  it('always lands on one of the eight compass points', () => {
    const codes = Object.keys(COUNTRIES) as ISOCountryCode[]
    for (const from of codes.slice(0, 40)) {
      const origin = countryLatLng(from)
      if (!origin) continue
      for (const to of ['MN', 'BR', 'AU', 'CA'] as ISOCountryCode[]) {
        const heading = probeHeading(origin, to)
        if (!heading) continue
        expect(heading.degrees % 45).toBe(0)
        expect(heading.degrees).toBeGreaterThanOrEqual(0)
        expect(heading.degrees).toBeLessThan(360)
      }
    }
  })

  it('reads a same-latitude neighbour as east', () => {
    expect(compassLabel(probeHeading(centroid('ES'), 'IT')!.degrees)).toBe('east')
  })

  it('follows the drawn map at high latitude, where the great circle says north', () => {
    const degrees = probeHeading(centroid('CA'), 'RU')!.degrees
    expect(['east', 'west']).toContain(compassLabel(degrees))
  })

  it('aims off the nearer edge when the short way crosses the date line', () => {
    const heading = probeHeading(centroid('JP'), 'US')!
    expect(heading.crossesDateLine).toBe(true)
    expect(['north-east', 'east', 'south-east']).toContain(compassLabel(heading.degrees))
    expect(probeHeading(centroid('FR'), 'DE')!.crossesDateLine).toBe(false)
  })

  it('measures from the clicked point, not the centroid', () => {
    const fromMoscow = probeHeading(MOSCOW, 'FI')!
    const fromCentroid = probeHeading(centroid('RU'), 'FI')!
    expect(fromMoscow.degrees).not.toBe(fromCentroid.degrees)
    expect(probeDistanceKm(MOSCOW, 'UA')!).toBeLessThan(probeDistanceKm(centroid('RU'), 'UA')! / 2)
  })
})

describe('probeOrigin', () => {
  it('takes the clicked point when the map supplied a usable one', () => {
    expect(probeOrigin('RU', MOSCOW)).toEqual(MOSCOW)
  })

  it('falls back to the centroid on a missing or garbage point', () => {
    expect(probeOrigin('RU')).toEqual(centroid('RU'))
    expect(probeOrigin('RU', { lat: Number.NaN, lng: 10 })).toEqual(centroid('RU'))
    expect(probeOrigin('RU', { lat: 95, lng: 10 })).toEqual(centroid('RU'))
    expect(probeOrigin('RU', { lat: 10, lng: 200 })).toEqual(centroid('RU'))
  })
})

describe('warmth', () => {
  it('bands distances at the named thresholds', () => {
    expect(warmthFor(HOT_COLD_WARMTH.hotKm - 1)).toBe('hot')
    expect(warmthFor(HOT_COLD_WARMTH.hotKm)).toBe('warm')
    expect(warmthFor(HOT_COLD_WARMTH.warmKm - 1)).toBe('warm')
    expect(warmthFor(HOT_COLD_WARMTH.warmKm)).toBe('cold')
    expect(temperatureFor(HOT_COLD_WARMTH.freezingKm)).toBe('cold')
    expect(temperatureFor(HOT_COLD_WARMTH.freezingKm + 1)).toBe('freezing')
  })
})

describe('probeTrend', () => {
  it('has nothing to compare on the first probe', () => {
    expect(probeTrend(3000)).toBeUndefined()
  })

  it('calls a new best the closest yet', () => {
    expect(probeTrend(900, { lastKm: 2100, bestKm: 1500 })).toEqual({
      trend: 'closest',
      deltaKm: 1200,
    })
  })

  it('calls an improvement on the last probe warmer when it is not a new best', () => {
    expect(probeTrend(1800, { lastKm: 3000, bestKm: 1500 })).toEqual({
      trend: 'warmer',
      deltaKm: 1200,
    })
  })

  it('calls anything no closer than the last probe colder', () => {
    expect(probeTrend(4000, { lastKm: 2000, bestKm: 2000 })).toEqual({
      trend: 'colder',
      deltaKm: 2000,
    })
  })
})
