import { describe, expect, it } from 'vitest'
import {
  boxAreaKm2,
  dropEnclosedBodies,
  clipChainToFrame,
  clipRingToFrame,
  closeSea,
  pointInRings,
  stitchDirected,
  signedArea,
  stitchChains,
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
import { CITY_TILE_HEIGHT, CITY_TILE_SPAN } from '../../lib/ground-plan'
import { cutAround } from '../data/city-cuts'
import { parsePolygons } from '../../lib/outline'

// Authored the way the roster authors every cut, so the fixture cannot drift
// from the real geometry.
const LONDON: BoundingBox = cutAround(51.506, -0.12)

describe('tileProjection', () => {
  it('fills the frame on both axes for a cut authored at its aspect', () => {
    const project = tileProjection(LONDON)
    const [south, west, north, east] = LONDON

    const southWest = project({ lat: south, lon: west })
    const northEast = project({ lat: north, lon: east })

    expect(southWest[0]).toBeCloseTo(0, 0)
    expect(northEast[0]).toBeCloseTo(CITY_TILE_SPAN, 0)
    expect(northEast[1]).toBeCloseTo(0, 0)
    expect(southWest[1]).toBeCloseTo(CITY_TILE_HEIGHT, 0)
  })

  it('keeps the safe zone centred — the square a portrait screen shows', () => {
    const project = tileProjection(LONDON)
    const [south, west, north, east] = LONDON
    const centre = project({ lat: (south + north) / 2, lon: (west + east) / 2 })

    expect(centre[0]).toBeCloseTo(CITY_TILE_SPAN / 2, 0)
    expect(centre[1]).toBeCloseTo(CITY_TILE_HEIGHT / 2, 0)
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
    expect(top[1] + (CITY_TILE_SPAN - bottom[1])).toBeCloseTo(
      CITY_TILE_SPAN - (bottom[1] - top[1]),
      0
    )
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

  // Timed out on CI at the default 5s: this asserts TERMINATION, not speed, and
  // shared runners are several times slower than a laptop.
  it('survives a dense line that no point can be dropped from', { timeout: 30_000 }, () => {
    // The pathological shape: a zigzag at a tolerance that discards nothing.
    // Douglas-Peucker's cost depends on how much it can THROW AWAY, so this is
    // the case that degrades — it hung outright before the chunk cap, and the
    // chunk slice recursed forever before its off-by-one was fixed.
    const dense: TilePoint[] = Array.from({ length: 20_000 }, (_, index) => [index, index % 2])
    expect(() => simplifyLine(dense, 0.1)).not.toThrow()
    expect(simplifyLine(dense, 0.1).length).toBeGreaterThan(0)
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

  it('joins the halves of one bridge that OSM split into opposing ways', () => {
    // The Brooklyn Bridge as it actually arrives: two ways whose midpoints are
    // far apart but which overlap end to end. A midpoint-only test read this
    // as two crossings.
    const spans: TilePoint[][] = [
      [
        [809, 497],
        [1096, 798],
      ],
      [
        [1101, 794],
        [814, 492],
      ],
    ]
    expect(countCrossings(spans)).toBe(1)
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
    expect(
      emitPath([
        [
          [10.1, 20.1],
          [10.2, 20.2],
        ],
      ])
    ).toBe('')
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

describe('stitchChains', () => {
  const meets = (a: TilePoint, b: TilePoint) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1

  it('walks fragments end to end into one chain', () => {
    const chains = stitchChains(
      [
        [
          [0, 0],
          [10, 0],
        ],
        [
          [20, 0],
          [30, 0],
        ],
        [
          [10, 0],
          [20, 0],
        ],
      ],
      meets
    )
    expect(chains).toHaveLength(1)
    expect(chains[0][0]).toEqual([0, 0])
    expect(chains[0].at(-1)).toEqual([30, 0])
  })

  it('reverses a fragment that runs backwards', () => {
    // The Thames arrives exactly like this: members in arbitrary direction.
    const chains = stitchChains(
      [
        [
          [0, 0],
          [10, 0],
        ],
        [
          [20, 0],
          [10, 0],
        ],
      ],
      meets
    )
    expect(chains).toHaveLength(1)
    expect(chains[0].at(-1)).toEqual([20, 0])
  })

  it('keeps genuinely separate chains apart', () => {
    expect(
      stitchChains(
        [
          [
            [0, 0],
            [10, 0],
          ],
          [
            [500, 500],
            [510, 500],
          ],
        ],
        meets
      )
    ).toHaveLength(2)
  })

  it('closes a ring whose ends meet', () => {
    const chains = stitchChains(
      [
        [
          [0, 0],
          [10, 0],
        ],
        [
          [10, 0],
          [10, 10],
        ],
        [
          [10, 10],
          [0, 0],
        ],
      ],
      meets
    )
    expect(chains).toHaveLength(1)
    expect(meets(chains[0][0], chains[0].at(-1)!)).toBe(true)
  })

  it('drops degenerate single-point fragments', () => {
    expect(stitchChains([[[0, 0]]], meets)).toEqual([])
  })
})

describe('signedArea', () => {
  it('signs a screen-clockwise ring positive', () => {
    // Right, down, left, up — clockwise as drawn, since y grows downward.
    // The coastline fill keys off this sign to decide which side is land, so
    // the convention matters more than which name it goes by.
    expect(
      signedArea([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ])
    ).toBeGreaterThan(0)
  })

  it('reverses sign with winding', () => {
    const ring: TilePoint[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]
    expect(signedArea(ring)).toBeCloseTo(-signedArea([...ring].reverse()), 6)
  })
})

describe('clipRingToFrame', () => {
  const W = 1777
  const H = 1000

  it('clips a ring that spills past one edge', () => {
    const ring = clipRingToFrame(
      [
        [-200, 100],
        [300, 100],
        [300, 400],
        [-200, 400],
        [-200, 100],
      ],
      W,
      H
    )
    expect(ring.length).toBeGreaterThanOrEqual(4)
    expect(Math.min(...ring.map(([x]) => x))).toBeGreaterThanOrEqual(0)
    expect(pointInRings([ring], [100, 250])).toBe(true)
  })

  it('reduces a ring that swallows the whole frame to the frame itself', () => {
    // The Mälaren case: the lake's outer ring runs a hundred kilometres past
    // the cut. The tile's share of it is simply the frame.
    const ring = clipRingToFrame(
      [
        [-90000, -90000],
        [90000, -90000],
        [90000, 90000],
        [-90000, 90000],
        [-90000, -90000],
      ],
      W,
      H
    )
    expect(pointInRings([ring], [W / 2, H / 2])).toBe(true)
    expect(pointInRings([ring], [10, 10])).toBe(true)
  })

  it('discards a ring entirely outside', () => {
    expect(
      clipRingToFrame(
        [
          [-500, -500],
          [-100, -500],
          [-100, -100],
          [-500, -100],
          [-500, -500],
        ],
        W,
        H
      )
    ).toEqual([])
  })
})

describe('clipChainToFrame', () => {
  const W = 1777
  const H = 1000

  it('clips a crossing line to one piece with both ends on the boundary', () => {
    const pieces = clipChainToFrame(
      [
        [-100, 500],
        [W + 100, 500],
      ],
      W,
      H
    )
    expect(pieces).toHaveLength(1)
    expect(pieces[0][0][0]).toBeCloseTo(0, 5)
    expect(pieces[0].at(-1)![0]).toBeCloseTo(W, 5)
  })

  it('splits a chain that leaves and re-enters into separate pieces', () => {
    const pieces = clipChainToFrame(
      [
        [-100, 200],
        [400, 200],
        [400, -300],
        [900, -300],
        [900, 200],
        [W + 100, 200],
      ],
      W,
      H
    )
    expect(pieces).toHaveLength(2)
  })

  it('leaves an interior endpoint alone unless asked to reach the edge', () => {
    // Only a coastline needs its ends on the boundary. Extending everything
    // ruled canals clean across the tile — London and Paris grew blue bars.
    const canal = clipChainToFrame(
      [
        [800, 400],
        [840, 460],
      ],
      W,
      H
    )
    expect(canal).toHaveLength(1)
    expect(canal[0]).toEqual([
      [800, 400],
      [840, 460],
    ])
  })

  it('pushes an endpoint stranded mid-frame out to the boundary when asked', () => {
    // Overpass never returned the next way along the coast, so the chain just
    // stops. The sea closure needs both ends on the boundary.
    const pieces = clipChainToFrame(
      [
        [-100, 500],
        [600, 500],
      ],
      W,
      H,
      { reachEdges: true }
    )
    expect(pieces).toHaveLength(1)
    const end = pieces[0].at(-1)!
    expect(end[0] <= 0 || end[0] >= W || end[1] <= 0 || end[1] >= H).toBe(true)
  })
})

describe('closeSea', () => {
  const W = 1777
  const H = 1000

  it('encloses the south for an east-running coast — the pinned example', () => {
    // OSM: land on the left of the way. Heading east, land is north, water
    // south. This single case fixes the walk direction for everything else.
    const rings = closeSea(
      [
        [
          [0, 500],
          [W, 500],
        ],
      ],
      W,
      H
    )
    expect(rings).toHaveLength(1)
    expect(pointInRings(rings, [W / 2, 750])).toBe(true)
    expect(pointInRings(rings, [W / 2, 250])).toBe(false)
  })

  it('encloses the north when the coast runs the other way', () => {
    const rings = closeSea(
      [
        [
          [W, 500],
          [0, 500],
        ],
      ],
      W,
      H
    )
    expect(pointInRings(rings, [W / 2, 250])).toBe(true)
    expect(pointInRings(rings, [W / 2, 750])).toBe(false)
  })

  it('joins facing shores into one strait — the Manhattan case', () => {
    // Two banks of a channel: the west bank walked north (land west of it) and
    // the east bank walked south (land east). Self-closure gives two rings
    // that each swallow half the frame; the boundary walk gives the channel.
    const rings = closeSea(
      [
        [
          [500, H],
          [500, 0],
        ],
        [
          [1200, 0],
          [1200, H],
        ],
      ],
      W,
      H
    )
    expect(rings).toHaveLength(1)
    expect(pointInRings(rings, [850, 500])).toBe(true)
    expect(pointInRings(rings, [200, 500])).toBe(false)
    expect(pointInRings(rings, [1500, 500])).toBe(false)
  })

  it('hands each of two separate waters its own ring', () => {
    // Land in the middle band: the north coast keeps its land to the south
    // (west-running), the south coast keeps its land to the north
    // (east-running). Two waters, one strip of dry ground between them.
    const rings = closeSea(
      [
        [
          [W, 300],
          [0, 300],
        ],
        [
          [0, 700],
          [W, 700],
        ],
      ],
      W,
      H
    )
    expect(rings).toHaveLength(2)
    expect(pointInRings(rings, [W / 2, 150])).toBe(true)
    expect(pointInRings(rings, [W / 2, 500])).toBe(false)
    expect(pointInRings(rings, [W / 2, 850])).toBe(true)
  })
})

describe('stitchDirected', () => {
  const meets = (a: TilePoint, b: TilePoint) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1

  it('joins end to start', () => {
    const chains = stitchDirected(
      [
        [
          [0, 0],
          [10, 0],
        ],
        [
          [10, 0],
          [20, 0],
        ],
      ],
      meets
    )
    expect(chains).toHaveLength(1)
    expect(chains[0].at(-1)).toEqual([20, 0])
  })

  it('refuses to reverse a fragment — direction is the meaning', () => {
    // Head-to-head fragments are a data error, not a joint: reversing one
    // would put its stretch of water on the wrong side of the world.
    const chains = stitchDirected(
      [
        [
          [0, 0],
          [10, 0],
        ],
        [
          [20, 0],
          [10, 0],
        ],
      ],
      meets
    )
    expect(chains).toHaveLength(2)
  })
})

describe('pointInRings', () => {
  const square: TilePoint[] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
    [0, 0],
  ]
  const hole: TilePoint[] = [
    [40, 40],
    [60, 40],
    [60, 60],
    [40, 60],
    [40, 40],
  ]

  it('is even-odd, like the fill it validates', () => {
    expect(pointInRings([square], [50, 50])).toBe(true)
    expect(pointInRings([square, hole], [50, 50])).toBe(false)
    expect(pointInRings([square, hole], [20, 20])).toBe(true)
    expect(pointInRings([square], [200, 50])).toBe(false)
  })
})

describe('dropEnclosedBodies', () => {
  const ring = (x0: number, y0: number, x1: number, y1: number): TilePoint[] => [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ]

  it('drops a bay mapped on top of its parent lake', () => {
    // The Mälaren/Riddarfjärden arrangement: painted together in one even-odd
    // path, the two outers cancel and the bay reads as land.
    const kept = dropEnclosedBodies([
      { outers: [ring(100, 100, 200, 200)], inners: [] },
      { outers: [ring(0, 0, 1000, 1000)], inners: [ring(400, 400, 500, 500)] },
    ])
    expect(kept).toHaveLength(1)
    expect(kept[0].inners).toHaveLength(1)
  })

  it('keeps genuinely separate waters', () => {
    const kept = dropEnclosedBodies([
      { outers: [ring(0, 0, 300, 300)], inners: [] },
      { outers: [ring(700, 700, 1000, 1000)], inners: [] },
    ])
    expect(kept).toHaveLength(2)
  })

  it('collapses a chain of nested names onto the one that paints', () => {
    const kept = dropEnclosedBodies([
      { outers: [ring(0, 0, 1000, 1000)], inners: [] },
      { outers: [ring(100, 100, 800, 800)], inners: [] },
      { outers: [ring(200, 200, 600, 600)], inners: [] },
    ])
    expect(kept).toHaveLength(1)
  })
})
