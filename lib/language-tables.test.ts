import { describe, expect, it } from 'vitest'
import { ISOCountryCodes } from '~~/data/iso-codes.gen'
import { SPEAKERS } from '~~/data/speakers.gen'
import { TONGUE_FACTS } from '~~/data/tongue-facts.gen'
import { TONGUES } from '~~/data/tongues.gen'
import { LANGUAGE_LOCALES } from '~~/generators/data/language-locales'
import { TONGUE_SAMPLE_SEEDS } from '~~/generators/data/tongue-sample-seeds'
import { SWEEP_SETS } from './clean-sweep'
import { spokenLanguages } from './language-rounds'
import { SCRIPTORIUM_POOL } from './scriptorium'

/**
 * Every table below is joined to the speaker index by the language's NAME, so
 * a spelling that drifts ("Slovene" against "Slovenian") unhooks it silently:
 * Slovenia's clips shipped for months and never dealt.
 */
const spoken = new Set(ISOCountryCodes.flatMap(isoCode => [...spokenLanguages(isoCode)]))
const recorded = new Set(ISOCountryCodes.flatMap(isoCode => Object.keys(SPEAKERS[isoCode] ?? {})))

/** Spoken where the game deals no country of its own: Wales is not on the board. */
const STATELESS = new Set(['Welsh'])

const unjoined = (names: Iterable<string>, index: ReadonlySet<string>) =>
  [...names].filter(name => !index.has(name) && !STATELESS.has(name))

describe('language tables join the speaker index', () => {
  it('names every clip, locale and seed as a language some country speaks', () => {
    expect(unjoined(Object.keys(TONGUES), spoken)).toEqual([])
    expect(unjoined(Object.keys(LANGUAGE_LOCALES), recorded)).toEqual([])
    expect(
      unjoined(
        TONGUE_SAMPLE_SEEDS.map(seed => seed.language),
        spoken
      )
    ).toEqual([])
  })

  it('names every Scriptorium page and Clean Sweep set as a spoken language', () => {
    expect(
      unjoined(
        SCRIPTORIUM_POOL.map(entry => entry.language),
        spoken
      )
    ).toEqual([])
    const sweepLanguages = Object.values(SWEEP_SETS).flatMap(set =>
      set.language ? [set.language] : []
    )
    expect(sweepLanguages.length).toBeGreaterThan(0)
    expect(unjoined(sweepLanguages, spoken)).toEqual([])
  })

  it('names every language fact as a language the speaker table records', () => {
    expect(unjoined(Object.keys(TONGUE_FACTS), recorded)).toEqual([])
  })
})
