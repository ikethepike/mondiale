import { describe, expect, it } from 'vitest'
import {
  PYRAMID_COUNTRIES,
  PYRAMID_YEARS,
  pyramidFrameAt,
  pyramidYearAt,
  pyramidDistance,
  pyramidReadoutGap,
  pyramidAgedAt,
  pyramidAgedApart,
  pyramidAgedLabel,
  pyramidFamily,
  frameFamily,
  medianAge,
  pyramidFacts,
  pyramidFactRows,
  PYRAMID_SCARS,
  PYRAMID_TUNING,
  pyramidDecoyFits,
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
  it('measures the distance the decoys are drawn by', () => {
    expect(pyramidDistance('CM', 'BJ')).toBeLessThan(5)
    expect(pyramidDistance('GB', 'NO')).toBeLessThan(8)
    expect(pyramidDistance('NE', 'JP')).toBeGreaterThan(60)
    expect(pyramidDistance('QA', 'NE')).toBeGreaterThan(60)
  })
  it('dates when a country aged', () => {
    expect(pyramidAgedAt('GB')).toBe('before')
    expect(pyramidAgedAt('NE')).toBe('never')
    expect(pyramidAgedAt('ME')).toBe(1978)
    expect(pyramidAgedApart('GB', 'ME')).toBe(20)
    expect(pyramidAgedLabel('before')).toBe('Median 25+ before 1963')
    expect(pyramidAgedLabel(1978)).toBe('Median hit 25 in 1978')
  })
  it('separates a converged pair by what the readout shows', () => {
    // Britain and Montenegro look alike today; in 1963 Montenegro was young.
    expect(pyramidDistance('GB', 'ME')).toBeLessThan(12)
    expect(pyramidReadoutGap('GB', 'ME')).toBeGreaterThan(6)
    expect(pyramidReadoutGap('GB', 'NO')).toBeLessThan(6)
  })
  it('makes hard decoys lookalikes and easy decoys strangers', () => {
    expect(pyramidDecoyFits('GB', 'ME', PYRAMID_TUNING.hard.decoys)).toBe(true)
    expect(pyramidDecoyFits('GB', 'ME', PYRAMID_TUNING.easy.decoys)).toBe(false)
    expect(pyramidDecoyFits('JP', 'NE', PYRAMID_TUNING.easy.decoys)).toBe(true)
    expect(pyramidDecoyFits('JP', 'NE', PYRAMID_TUNING.hard.decoys)).toBe(false)
    expect(pyramidDecoyFits('JP', 'JP', PYRAMID_TUNING.easy.decoys)).toBe(false)
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
  it('classifies the frame on screen with the same rule as today', () => {
    for (const isoCode of PYRAMID_COUNTRIES) {
      expect(frameFamily(latestPyramid(isoCode)!)).toBe(pyramidFamily(isoCode))
    }
    // Korea's transition: a triangle in 1963, a coffin now.
    expect(frameFamily(pyramidFrameAt('KR', 0)!)).toBe('expansive')
  })
  it('reads the median age off the cohorts', () => {
    expect(medianAge(latestPyramid('JP')!)).toBeGreaterThan(45)
    expect(medianAge(latestPyramid('NE')!)).toBeLessThan(17)
    expect(medianAge(pyramidFrameAt('KR', 0)!)).toBeLessThan(21)
  })
  it('derives the facts a reveal prints', () => {
    expect(pyramidFacts('GB')!.twin).toBe('NO')
    const labels = (isoCode: 'QA' | 'FR') =>
      pyramidFactRows(pyramidFacts(isoCode)!).map(r => r.label)
    expect(labels('QA')).toContain('Men per 100 women, 20–49')
    expect(labels('FR')).not.toContain('Men per 100 women, 20–49')
  })
  it('points every scar at a cohort some frame shows', () => {
    for (const [isoCode, scars] of Object.entries(PYRAMID_SCARS)) {
      for (const scar of scars!) {
        const visible = PYRAMID_YEARS.some(year => pyramidScarIndex(scar, year) !== undefined)
        expect(visible, `${isoCode} ${scar.bornFrom}`).toBe(true)
      }
    }
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

  it('leaves every difficulty a wide pool of subjects on the world board', () => {
    // Hard is narrower by design: only lookalikes that aged decades apart.
    const SUBJECT_FLOOR = { easy: 100, normal: 100, hard: 60 }
    // A subject needs three decoys in its band; if a data revision narrows
    // this, the round degrades to the same handful of countries every game.
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const usable = PYRAMID_COUNTRIES.filter(
        country =>
          PYRAMID_COUNTRIES.filter(other =>
            pyramidDecoyFits(country, other, PYRAMID_TUNING[difficulty].decoys)
          ).length >=
          PYRAMID_TUNING[difficulty].options - 1
      )
      expect(usable.length, difficulty).toBeGreaterThan(SUBJECT_FLOOR[difficulty])
    }
  })
})
