import { describe, expect, it } from 'vitest'
import { WATER_FEATURES } from '~~/data/water.gen'
import {
  WATER_PARTS,
  WATER_ROSTER_EXPECTATIONS,
  WATER_SHORE_CORRECTIONS,
} from '~~/data/static/water-shore-corrections'
import type { OutlinePoint } from '~~/lib/outline'
import type { ISOCountryCode } from '~~/types/geography.types'
import {
  applyShoreCorrections,
  createShoreTest,
  foldWaterParts,
  rosterDrift,
  type WaterKey,
} from './water-keys'

const square = (x: number, y: number, size: number): OutlinePoint[] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
]

const land = (code: string, ...rings: OutlinePoint[][]) => ({
  code: code as ISOCountryCode,
  rings,
})

describe('createShoreTest', () => {
  const sea = [square(0, 0, 100)]

  it('measures edge to edge, so a coast facing a long straight shore with no vertex near it counts', () => {
    const shores = createShoreTest([land('AA', square(40, 100.3, 20))], 0.5)
    expect([...shores(sea)]).toEqual(['AA'])
  })

  it('leaves out land just past the shore distance', () => {
    const shores = createShoreTest([land('AA', square(40, 101, 20))], 0.5)
    expect(shores(sea).size).toBe(0)
  })

  it('finds an island in the middle of the sea, far from every edge', () => {
    const shores = createShoreTest([land('MT', square(50, 50, 2))], 0.5)
    expect([...shores(sea)]).toEqual(['MT'])
  })

  it('finds the country a lake lies wholly inside', () => {
    const shores = createShoreTest(
      [land('RU', square(0, 0, 100)), land('FI', square(-50, 0, 49))],
      0.5
    )
    expect([...shores([square(10, 10, 5)])]).toEqual(['RU'])
  })

  it('treats a hole in the water as dry land', () => {
    const shores = createShoreTest([land('AA', square(60, 60, 2))], 0.5)
    expect(shores([square(0, 0, 100), square(50, 50, 30)]).size).toBe(0)
  })
})

const key = (id: string, countries: string[]): WaterKey => ({
  id,
  d: `M ${id}`,
  bounds: [0, 0, 1, 1],
  countries: countries as ISOCountryCode[],
})

describe('applyShoreCorrections', () => {
  it('adds and drops, keeping the key sorted', () => {
    const features = { sea: key('sea', ['FI', 'NO', 'RU']) }
    applyShoreCorrections(features, { sea: { include: ['IS'], exclude: ['FI'] } })
    expect(features.sea.countries).toEqual(['IS', 'NO', 'RU'])
  })

  it('reports every entry that no longer does anything', () => {
    const features = { sea: key('sea', ['NO', 'RU']) }
    expect(
      applyShoreCorrections(features, {
        sea: { include: ['NO'], exclude: ['FI'] },
        gone: { include: ['IS'] },
      })
    ).toEqual(['sea: already includes NO', 'sea: already lacks FI', 'gone: no such feature'])
  })
})

describe('foldWaterParts', () => {
  it('draws and lists each arm in the whole, and leaves the arm dealing as itself', () => {
    const features = {
      med: key('med', ['FR', 'IT']),
      adriatic: { ...key('adriatic', ['HR', 'IT']), bounds: [2, 2, 3, 3] as WaterKey['bounds'] },
    }
    foldWaterParts(features, { med: ['adriatic'] })
    expect(features.med.countries).toEqual(['FR', 'HR', 'IT'])
    expect(features.med.d).toBe('M med M adriatic')
    expect(features.med.bounds).toEqual([0, 0, 5, 5])
    expect(features.adriatic.countries).toEqual(['HR', 'IT'])
  })

  it('refuses a nested arm', () => {
    const features = { a: key('a', []), b: key('b', []), c: key('c', []) }
    expect(() => foldWaterParts(features, { a: ['b'], b: ['c'] })).toThrow(/itself a whole/)
  })
})

describe('the shipped water answer keys', () => {
  it('hold every pinned roster', () => {
    expect(rosterDrift(WATER_FEATURES, WATER_ROSTER_EXPECTATIONS)).toEqual([])
  })

  it('pin the Mediterranean, Barents, Norwegian Sea and Sahara fixes', () => {
    const shores = (id: string) => WATER_FEATURES[id].countries
    expect(shores('mediterranean-sea')).toEqual(
      expect.arrayContaining(['MT', 'HR', 'AL', 'ME', 'SI', 'MA'])
    )
    expect(shores('barents-sea')).not.toContain('FI')
    expect(shores('norwegian-sea')).not.toContain('SE')
    for (const code of ['CM', 'CF', 'ET', 'SS', 'NG', 'BF', 'SN'])
      expect(shores('desert-sahara')).not.toContain(code)
  })

  it('already carry every curated correction', () => {
    for (const [id, { include = [], exclude = [] }] of Object.entries(WATER_SHORE_CORRECTIONS)) {
      expect(WATER_FEATURES[id]?.countries, id).toEqual(expect.arrayContaining(include))
      for (const code of exclude) expect(WATER_FEATURES[id].countries, id).not.toContain(code)
    }
  })

  it("list every arm's shores on the sea it belongs to", () => {
    for (const [wholeId, partIds] of Object.entries(WATER_PARTS))
      for (const partId of partIds)
        expect(WATER_FEATURES[wholeId].countries, `${partId} → ${wholeId}`).toEqual(
          expect.arrayContaining(WATER_FEATURES[partId].countries)
        )
  })

  it('never deal one name under two keys', () => {
    const byName = new Map<string, string[]>()
    for (const feature of Object.values(WATER_FEATURES))
      byName.set(feature.name, [...(byName.get(feature.name) ?? []), feature.id])
    expect([...byName.values()].filter(ids => ids.length > 1)).toEqual([])
  })
})
