import { describe, expect, it } from 'vitest'
import {
  PYRAMID_COUNTRIES,
  PYRAMID_YEARS,
  pyramidFrameAt,
  pyramidYearAt,
  pyramidDistance,
  pyramidsAreDistinct,
  pyramidFamily,
  PYRAMID_FAMILY_LABELS,
  pyramidScarIndex,
  latestPyramid,
  shareUnder15,
  workingAgeSexSkew,
  pyramidPeakShare,
} from '~~/lib/pyramids'

describe('pyramids lib', () => {
  it('has the full ladder', () => {
    expect(PYRAMID_COUNTRIES.length).toBe(194)
    expect(PYRAMID_YEARS).toEqual([
      1963, 1968, 1973, 1978, 1983, 1988, 1993, 1998, 2003, 2008, 2013, 2018, 2023,
    ])
  })
  it('interpolates between frames', () => {
    const a = pyramidFrameAt('JP', 0)!,
      b = pyramidFrameAt('JP', 1)!,
      mid = pyramidFrameAt('JP', 0.5)!
    expect(mid.male[0]).toBeCloseTo((a.male[0] + b.male[0]) / 2, 6)
    expect(pyramidYearAt(0)).toBe(1963)
    expect(pyramidYearAt(12)).toBe(2023)
    expect(pyramidYearAt(0.5)).toBe(1966)
  })
  it('clamps out of range', () => {
    expect(pyramidFrameAt('JP', -5)!.year).toBe(1963)
    expect(pyramidFrameAt('JP', 99)!.year).toBe(2023)
  })
  it('measures distance the dealer gates on', () => {
    expect(pyramidDistance('CM', 'BJ')).toBeLessThan(5)
    expect(pyramidDistance('NE', 'JP')).toBeGreaterThan(60)
    expect(pyramidsAreDistinct(['NE', 'JP', 'QA', 'US'], 20)).toBe(true)
    expect(pyramidsAreDistinct(['CM', 'BJ'], 20)).toBe(false)
  })
  it('classifies families distinctly', () => {
    expect(pyramidFamily('QA')).toBe('migrant-slab')
    expect(pyramidFamily('NE')).toBe('expansive')
    expect(pyramidFamily('JP')).toBe('coffin')
    expect(pyramidFamily('IN')).toBe('barrel')
    // Every family must earn its place in the vocabulary — a label no country
    // ever wears is a lesson the reveal can never teach.
    const seen = new Set(PYRAMID_COUNTRIES.map(c => pyramidFamily(c)))
    for (const family of Object.keys(PYRAMID_FAMILY_LABELS)) expect(seen).toContain(family)
  })
  it('moves a scar cohort up the pyramid as it ages', () => {
    // Germany's Pillenknick cohort (born 1966) sits low in 1968, high in 2023
    expect(pyramidScarIndex({ bornFrom: 1966, note: '' }, 1968)).toBe(0)
    expect(pyramidScarIndex({ bornFrom: 1966, note: '' }, 2023)).toBe(11)
    expect(pyramidScarIndex({ bornFrom: 2011, note: '' }, 1963)).toBeUndefined()
  })
  it('peak share spans every frame of every subject', () => {
    const peak = pyramidPeakShare(['NE', 'JP'])
    for (const iso of ['NE', 'JP'] as const)
      for (let p = 0; p <= 12; p++) {
        const f = pyramidFrameAt(iso, p)!
        expect(Math.max(...f.male, ...f.female)).toBeLessThanOrEqual(peak + 1e-9)
      }
  })
  it('reads the well-known extremes', () => {
    expect(shareUnder15(latestPyramid('NE')!)).toBeGreaterThan(45)
    expect(workingAgeSexSkew(latestPyramid('QA')!)).toBeGreaterThan(30)
  })

  it('leaves the dealer a wide pool at the readability floor', () => {
    // The whole mode rests on this: a floor that reads well must still let most
    // of the roster appear. If a data revision narrows this, the round degrades
    // to the same handful of countries every game.
    const roster = PYRAMID_COUNTRIES
    const usable = roster.filter(
      country =>
        roster.filter(other => other !== country && pyramidDistance(country, other) >= 20).length >=
        3
    )
    expect(usable.length).toBeGreaterThan(150)
  })
})
