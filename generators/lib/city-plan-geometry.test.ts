import { describe, expect, it } from 'vitest'
import {
  boxAreaKm2,
  countCrossings,
  countVertices,
  crossesWater,
  emitPath,
  haversineKm,
  isRing,
  lineLength,
  simplifyLine,
  streetDensity,
  tileProjection,
  waterSpan,
  type BoundingBox,
  type TilePoint,
} from './city-plan-geometry'
import { CITY_TILE_SPAN } from '../../lib/ground-plan'
import { parsePolygons } from '../../lib/outline'

const LONDON: BoundingBox = [51.497, -0.135, 51.515, -0.105]

describe('tileProjection', () => {
  it('fits the longer axis to the frame and letterboxes the other', () => {
    const project = tileProjection(LONDON)
    const [south, west, north, east] = LONDON

    const southWest = project({ lat: south, lon: west })
    const northEast = project({ lat: north, lon: east })

    // This cut is wider than it is tall, so longitude spans the full frame
    // and latitude sits inset — never the reverse, or the tile would crop.
    expect(southWest[0]).toBeCloseTo(0, 0)
    expect(northEast[0]).toBeCloseTo(CITY_TILE_SPAN, 0)
    expect(northEast[1]).toBeGreaterThan(0)
    expect(southWest[1]).toBeLessThan(CITY_TILE_SPAN)
  })

  it('keeps north up and east right', () => {
    const project = tileProjection(LONDON)
    const centre = project({ lat: 51.506, lon: -0.12 })
    const north = project({ lat: 51.512, lon: -0.12 })
    const east = project({ lat: 51.506, lon: -0.11 })

    expect(north[1]).toBeLessThan(centre[1])
    expect(east[0]).toBeGreaterThan(centre[0])
  })

  it('preserves aspect — a square of ground is a square on the tile', () => {
    const project = tileProjection(LONDON)
    const origin = project({ lat: 51.5, lon: -0.13 })
    const oneKmNorth = project({ lat: 51.5 + 1 / 111.32, lon: -0.13 })
    const oneKmEast = project({
      lat: 51.5,
      lon: -0.13 + 1 / (111.32 * Math.cos(51.5 * (Math.PI / 180))),
    })

    const vertical = Math.abs(oneKmNorth[1] - origin[1])
    const horizontal = Math.abs(oneKmEast[0] - origin[0])
    expect(horizontal / vertical).toBeCloseTo(1, 1)
  })

  it('centres the shorter axis of a non-square cut', () => {
    const wide: BoundingBox = [51.5, -0.14, 51.505, -0.1]
    const project = tileProjection(wide)
    const top = project({ lat: 51.505, lon: -0.12 })
    const bottom = project({ lat: 51.5, lon: -0.12 })

    expect(top[1]).toBeGreaterThan(0)
    expect(bottom[1]).toBeLessThan(CITY_TILE_SPAN)
    expect(top[1] + (CITY_TILE_SPAN - bottom[1])).toBeCloseTo(CITY_TILE_SPAN - (bottom[1] - top[1]), 0)
  })
})

describe('simplifyLine', () => {
  it('collapses a straight run to its ends', () => {
    const straight: TilePoint[] = [
      [0, 0],
      [10, 0],
      [20, 0],
      [30, 0],
    ]
    expect(simplifyLine(straight, 1)).toEqual([
      [0, 0],
      [30, 0],
    ])
  })

  it('keeps a corner that exceeds the tolerance', () => {
    const corner: TilePoint[] = [
      [0, 0],
      [10, 40],
      [20, 0],
    ]
    expect(simplifyLine(corner, 3)).toHaveLength(3)
  })

  it('drops a wobble below the tolerance', () => {
    const wobble: TilePoint[] = [
      [0, 0],
      [10, 1],
      [20, 0],
    ]
    expect(simplifyLine(wobble, 3)).toHaveLength(2)
  })

  it('survives a line long enough to blow a recursive implementation', () => {
    const long: TilePoint[] = Array.from({ length: 60_000 }, (_, index) => [index, index % 2])
    expect(() => simplifyLine(long, 0.1)).not.toThrow()
  })

  it('never reorders or invents points', () => {
    const zigzag: TilePoint[] = [
      [0, 0],
      [10, 50],
      [20, 0],
      [30, 50],
    ]
    const simplified = simplifyLine(zigzag, 1)
    expect(zigzag).toEqual(expect.arrayContaining(simplified))
    expect(simplified[0]).toEqual(zigzag[0])
    expect(simplified.at(-1)).toEqual(zigzag.at(-1))
  })
})

describe('crossesWater', () => {
  const river: TilePoint[][] = [
    [
      [0, 500],
      [1000, 500],
    ],
  ]

  it('finds a way that spans the river', () => {
    expect(
      crossesWater(
        [
          [500, 400],
          [500, 600],
        ],
        river
      )
    ).toBe(true)
  })

  it('rejects an overpass that never reaches the water', () => {
    expect(
      crossesWater(
        [
          [500, 100],
          [500, 300],
        ],
        river
      )
    ).toBe(false)
  })

  it('rejects a way that runs alongside the bank', () => {
    expect(
      crossesWater(
        [
          [100, 480],
          [900, 480],
        ],
        river
      )
    ).toBe(false)
  })
})

describe('waterSpan', () => {
  const river: TilePoint[][] = [
    [
      [0, 500],
      [1000, 500],
    ],
  ]

  it('trims the approaches to the crossing itself', () => {
    const withApproaches: TilePoint[] = [
      [500, 0],
      [500, 200],
      [500, 460],
      [500, 540],
      [500, 800],
      [500, 1000],
    ]
    const span = waterSpan(withApproaches, river)

    expect(span.length).toBeLessThan(withApproaches.length)
    expect(lineLength(span)).toBeLessThan(lineLength(withApproaches))
    // The span must still bridge both banks, or the reveal draws a gap.
    expect(Math.min(...span.map(([, y]) => y))).toBeLessThan(500)
    expect(Math.max(...span.map(([, y]) => y))).toBeGreaterThan(500)
  })

  it('returns a non-crossing line unchanged', () => {
    const inland: TilePoint[] = [
      [0, 100],
      [200, 100],
    ]
    expect(waterSpan(inland, river)).toEqual(inland)
  })
})

describe('countCrossings', () => {
  it('counts one crossing for the carriageways of a single bridge', () => {
    const spans: TilePoint[][] = [
      [
        [500, 480],
        [500, 520],
      ],
      [
        [504, 480],
        [504, 520],
      ],
      [
        [508, 480],
        [508, 520],
      ],
    ]
    expect(countCrossings(spans)).toBe(1)
  })

  it('counts bridges far apart separately', () => {
    const spans: TilePoint[][] = [
      [
        [100, 480],
        [100, 520],
      ],
      [
        [900, 480],
        [900, 520],
      ],
    ]
    expect(countCrossings(spans)).toBe(2)
  })

  it('counts nothing in a city with no crossings', () => {
    expect(countCrossings([])).toBe(0)
  })
})

describe('emitPath', () => {
  it('emits absolute move then relative lines', () => {
    const path = emitPath([
      [
        [10, 20],
        [30, 20],
        [30, 60],
      ],
    ])
    expect(path).toBe('M 10,20 l 20,0 0,40')
  })

  it('closes rings when asked', () => {
    const path = emitPath(
      [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 0],
        ],
      ],
      true
    )
    expect(path.endsWith(' z')).toBe(true)
  })

  it('parses back through the runtime outline reader', () => {
    const path = emitPath(
      [
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
          [0, 0],
        ],
      ],
      true
    )
    const rings = parsePolygons(path)
    expect(rings).toHaveLength(1)
    expect(rings[0].length).toBeGreaterThanOrEqual(3)
  })

  it('drops a line that collapses to one point after rounding', () => {
    expect(emitPath([[[10.1, 20.1], [10.2, 20.2]]])).toBe('')
  })

  it('clamps runaway geometry to just outside the frame', () => {
    // A way running on to the next city must not carry thousands of unseen
    // units into the payload, but it must still leave the frame edge.
    const path = emitPath([
      [
        [0, 0],
        [500_000, 0],
      ],
    ])
    const [, delta] = path.match(/l (-?\d+),/) ?? []
    expect(Number(delta)).toBeGreaterThan(CITY_TILE_SPAN)
    expect(Number(delta)).toBeLessThan(CITY_TILE_SPAN * 1.5)
  })
})

describe('measurement helpers', () => {
  it('counts vertices across every line', () => {
    expect(
      countVertices([
        [
          [0, 0],
          [1, 1],
        ],
        [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
      ])
    ).toBe(5)
  })

  it('recognises a closed ring', () => {
    expect(
      isRing([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 0],
      ])
    ).toBe(true)
    expect(
      isRing([
        [0, 0],
        [10, 0],
        [10, 10],
      ])
    ).toBe(false)
  })

  it('measures a known distance', () => {
    // One degree of latitude is ~111km anywhere.
    expect(haversineKm({ lat: 51, lon: 0 }, { lat: 52, lon: 0 })).toBeCloseTo(111, 0)
  })

  it('scores street density against a cut of known size', () => {
    const area = boxAreaKm2(LONDON)
    expect(area).toBeGreaterThan(3)
    expect(area).toBeLessThan(8)
    expect(streetDensity(95, LONDON)).toBeGreaterThan(10)
  })
})
