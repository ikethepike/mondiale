import { readdirSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DATASETS,
  INDIVIDUAL_STAT_ORIGINS,
  PROVIDERS,
  SOURCES,
  STAT_ORIGINS,
  TREND_ORIGINS,
  attributionFor,
  attributionLine,
  datasetAttribution,
  mediaCreditLine,
  pickMediaCredit,
  trendAttribution,
  type DataOrigin,
  type DataSetId,
  type ProviderId,
  type SourceId,
} from './attribution'
import type { Amount } from '~~/types/geography.types'

const ROOT = new URL('..', import.meta.url).pathname

const everyOrigin = (): DataOrigin[] => [
  ...Object.values(STAT_ORIGINS),
  ...Object.values(INDIVIDUAL_STAT_ORIGINS),
  ...Object.values(TREND_ORIGINS),
  ...Object.values(DATASETS).flatMap(dataset => [...dataset.origins]),
]

describe('the registry', () => {
  it('gives every source a provider that exists', () => {
    for (const [id, source] of Object.entries(SOURCES)) {
      expect(PROVIDERS[source.provider], `${id} -> ${source.provider}`).toBeDefined()
    }
  })

  it('names only sources that exist', () => {
    for (const origin of everyOrigin()) {
      expect(SOURCES[origin.source], origin.source).toBeDefined()
      for (const fallback of origin.fallback ?? []) {
        expect(SOURCES[fallback], fallback).toBeDefined()
      }
    }
  })

  it('ships the logo file every provider claims', () => {
    for (const [id, provider] of Object.entries(PROVIDERS)) {
      if (!provider.logo) continue
      expect(existsSync(`${ROOT}assets/logos/sources/${provider.logo}`), `${id}`).toBe(true)
    }
  })

  it('leaves no source unused', () => {
    const used = new Set<SourceId>()
    for (const origin of everyOrigin()) {
      used.add(origin.source)
      for (const fallback of origin.fallback ?? []) used.add(fallback)
    }
    expect([...(Object.keys(SOURCES) as SourceId[])].filter(id => !used.has(id))).toEqual([])
  })

  it('leaves no provider unused', () => {
    const credited = new Set<ProviderId>(Object.values(SOURCES).map(source => source.provider))
    expect([...(Object.keys(PROVIDERS) as ProviderId[])].filter(id => !credited.has(id))).toEqual(
      []
    )
  })
})

describe('dataset coverage', () => {
  // The guarantee: a new generated data file is unattributed until it is
  // claimed by a DATASETS entry, and this fails until it is.
  const generated = readdirSync(`${ROOT}data`)
    .filter(file => file.endsWith('.gen.ts'))
    .map(file => `data/${file}`)

  const claimed = Object.values(DATASETS).flatMap(dataset => [...dataset.files])

  it('attributes every generated data file', () => {
    expect(generated.filter(file => !claimed.includes(file))).toEqual([])
  })

  it('claims no file twice, and none that is missing', () => {
    expect(claimed.length).toBe(new Set(claimed).size)
    expect(claimed.filter(file => !existsSync(`${ROOT}${file}`))).toEqual([])
  })
})

describe('attributionFor', () => {
  it('credits the compiler and the body behind the numbers', () => {
    const spending: Amount<'%'> = { amount: 2, unit: '%', year: 2024 }
    const attribution = attributionFor('economics.militarySpending', spending)
    expect(attribution.credit).toBe('SIPRI via Our World in Data')
    expect(attribution.year).toBe(2024)
    expect(attribution.url).toBe(
      'https://ourworldindata.org/grapher/military-expenditure-share-gdp'
    )
  })

  it('credits the source a value actually came from when it fell back', () => {
    const attribution = attributionFor('economics.militarySpending', {
      year: 2019,
      source: 'cia-factbook',
    })
    expect(attribution.credit).toBe('CIA World Factbook')
    expect(attribution.sourceId).toBe('cia-factbook')
    // The OWID series' deep link must not travel with a Factbook figure.
    expect(attribution.url).toBe(SOURCES['cia-factbook'].url)
  })

  it("falls back to the release's vintage when a value carries no year", () => {
    expect(attributionFor('people.density', { year: undefined }).year).toBe(
      SOURCES['un-wpp-2024'].year
    )
  })

  it('resolves gate accessors too', () => {
    expect(attributionFor('flag').provider.name).toBe('flag-icons')
    expect(attributionFor('government.leader').credit).toBe('CIA World Factbook')
  })

  it('writes a caption a view can print', () => {
    expect(attributionLine(attributionFor('people.population', { year: 2023 }))).toBe(
      'UN World Population Prospects · 2023'
    )
  })
})

describe('trendAttribution', () => {
  it('dates a series by its last point', () => {
    expect(trendAttribution('gdpPerCapita', 2023)).toMatchObject({
      credit: 'World Bank via Our World in Data',
      year: 2023,
    })
  })
})

describe('media credits', () => {
  it('names the photographer, the licence and where the file came from', () => {
    expect(mediaCreditLine({ credit: 'Jane Doe', license: 'CC BY-SA 4.0' }, 'commons-media')).toBe(
      'Jane Doe · CC BY-SA 4.0 · Wikimedia Commons'
    )
  })

  it("lets an entry's own source win the dataset's", () => {
    expect(
      mediaCreditLine(
        { credit: 'Sam Reed', license: 'Unsplash Licence', imageSource: 'unsplash-photos' },
        'commons-media'
      )
    ).toBe('Sam Reed · Unsplash Licence · Unsplash')
  })

  it('stays undefined when nothing was captured, so no empty rule renders', () => {
    expect(mediaCreditLine(undefined, 'commons-media')).toBeUndefined()
    expect(mediaCreditLine({}, 'commons-media')).toBeUndefined()
  })

  it('carries only the credit fields between generator runs', () => {
    // Stand-ins for a generator row: game data alongside the credit, which is
    // what every real caller passes. Bound to variables rather than written
    // inline so TypeScript's excess-property check doesn't reject the extras
    // the function is specifically there to drop.
    const credited = { name: 'Petra', image: '/landmarks/petra.webp', credit: 'Jane Doe' }
    const uncredited = { name: 'Petra', credit: undefined }
    expect(pickMediaCredit(credited)).toEqual({ credit: 'Jane Doe' })
    expect(pickMediaCredit(uncredited)).toBeUndefined()
  })
})

describe('datasetAttribution', () => {
  it('credits every hand behind a dataset, primary first', () => {
    const credits = datasetAttribution('empires').map(attribution => attribution.credit)
    expect(credits[0]).toBe('historical-basemaps')
    expect(credits).toContain('CShapes 2.0')
    expect(credits).toContain('Wikimedia Commons')
  })

  it('covers every dataset id', () => {
    for (const id of Object.keys(DATASETS) as DataSetId[]) {
      expect(datasetAttribution(id).length, id).toBeGreaterThan(0)
    }
  })
})
