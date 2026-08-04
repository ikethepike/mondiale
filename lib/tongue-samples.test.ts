import { describe, expect, it } from 'vitest'
import { anthemTongueSample, seededTongueSample, tongueSampleSource } from './tongue-samples'
import type { AnthemLyrics } from '~~/types/challenges/group-modes.type'

describe('tongueSampleSource', () => {
  it('defers to the seed when one exists', () => {
    // Hindi has a hand-written seed; borrowing an anthem over it would swap a
    // curated sample for a scraped one.
    expect(seededTongueSample('Hindi')).toBeDefined()
    expect(tongueSampleSource('Hindi')).toBeUndefined()
  })

  it('borrows from a country that sings in the language', () => {
    expect(tongueSampleSource('Swahili')).toBe('/anthems/lyrics/KE-anthem.json')
    expect(tongueSampleSource('Ukrainian')).toBe('/anthems/lyrics/UA-anthem.json')
  })

  it('drops the region tag before the anthem lookup', () => {
    // TONGUES keys Swedish as `sv-SE`; the anthem index keys `sv`. Without the
    // base-code cut this silently returns nothing.
    expect(tongueSampleSource('Swedish')).toBe('/anthems/lyrics/SE-anthem.json')
  })

  it('returns nothing for an unknown language', () => {
    expect(tongueSampleSource('Klingon')).toBeUndefined()
  })
})

describe('anthemTongueSample', () => {
  const wall = (local: string[]): AnthemLyrics => ({
    isoCode: 'UA',
    title: 'Anthem',
    language: { code: 'uk', name: 'Ukrainian', script: 'Cyrillic' },
    sources: { local: { licence: 'PD' }, english: { licence: 'PD' } },
    verses: [{ local, english: [] }],
  })

  it('skips lines that mask a country name', () => {
    // The masks exist BECAUSE those words name the country — a written hint
    // that includes them points at the answer instead of narrowing it.
    const sample = anthemTongueSample(
      wall(['Ще не вмерла [[Україна]],', 'Ще нам, браття…', 'Згинуть наші…'])
    )
    expect(sample?.lines).toEqual(['Ще нам, браття…', 'Згинуть наші…'])
    expect(sample?.script).toBe('Cyrillic')
    expect(sample?.code).toBe('uk')
  })

  it('returns nothing when every line is masked', () => {
    expect(anthemTongueSample(wall(['[[Україна]] понад усе']))).toBeUndefined()
  })
})
