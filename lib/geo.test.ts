import { describe, expect, it } from 'vitest'
import {
  LOGO_MAX_RATIO,
  LOGO_MAX_SIDE,
  LOGO_MIN_RATIO,
  LOGO_MIN_SIDE,
  WORLD_BOX,
  boxesIntersect,
  logoBox,
  logoPaintedArea,
  regionsIntersect,
  relaxLogoPlacements,
  unionBox,
  zoomOutStartView,
  type MapBox,
} from './geo'
import { largestRing, poleOfInaccessibility, ringContains } from './outline'
import { MAP_BOUNDS, MAP_PATHS, MAP_REGIONS } from '~~/data/map.gen'
import { COUNTRIES } from '~~/data/countries.gen'
import { isShapeFriendly } from './challenges'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * The zoom-out gate's opening frame, swept over every mapped country.
 *
 * The bug this pins: the crop used to be centred on `frameForBoxes`' output,
 * which ends in `berthedView` — a frame deliberately pushed off-centre so the
 * subject clears the typing console. The crop inherited that offset and opened
 * on the neighbour. The berth is what makes it bite, so these tests MODEL the
 * berth; a berth-free sweep looks far healthier than the real thing.
 */

/** GameMap's `frameForBoxes` + `berthedView`, for the single-box case. */
const MAX_ZOOM = 40
const endFrame = (
  box: MapBox,
  viewAspect: number,
  berthBottomPx: number,
  viewportHeightPx: number
) => {
  const [bx, by, bw, bh] = box
  const pad = Math.max(bw * 0.35, bh * 0.35, 60)
  let x = bx - pad
  let y = by - pad
  let width = bw + pad * 2
  let height = bh + pad * 2
  const contentY = y
  const contentHeight = height

  if (width / height > viewAspect) {
    const grow = width / viewAspect - height
    y -= grow / 2
    height += grow
  } else {
    const grow = height * viewAspect - width
    x -= grow / 2
    width += grow
  }
  const minWidth = WORLD_BOX.width / MAX_ZOOM
  if (width < minWidth) {
    const grow = minWidth / width
    x += width / 2 - (width * grow) / 2
    y += height / 2 - (height * grow) / 2
    width *= grow
    height *= grow
  }

  const band = viewportHeightPx - berthBottomPx
  if (!berthBottomPx || band < viewportHeightPx * 0.35) return { x, y, width, height }
  const bandScale = viewportHeightPx / band
  const centerFraction = band / 2 / viewportHeightPx
  const contentHeightPx = viewportHeightPx * (contentHeight / height)
  const scale = Math.max(1, contentHeightPx / (viewportHeightPx / bandScale))
  const scaledHeight = height * scale
  return {
    x: x + width / 2 - (width * scale) / 2,
    y: contentY + contentHeight / 2 - centerFraction * scaledHeight,
    width: width * scale,
    height: scaledHeight,
  }
}

/** The three real shapes of this gate. The keyboard case is the normal one —
 *  the player is typing the answer — and was the worst before the fix. */
const VIEWPORTS = [
  { label: 'desktop 1280x800', aspect: 1280 / 800, viewport: 800, berth: 176 },
  { label: 'phone 390x844', aspect: 390 / 844, viewport: 844, berth: 216 },
  { label: 'phone, keyboard up', aspect: 390 / 844, viewport: 844, berth: 436 },
]

/**
 * Every country the gate can actually deal, through the dealer's OWN gate — so
 * this sweep covers exactly the set a player can be shown, and grows with it.
 * That drops the map's EXTRA_MAP_CODES (Anguilla, Mayotte) and the scattered
 * micro-states (Monaco, Tuvalu, Kiribati), whose inscribed circles are a
 * fraction of a unit — far under the crop's 10-unit legibility floor, so no
 * anchor could put their land in frame. They are excluded from shape modes for
 * that same reason. Sweeping the drawn map would test frames no player sees.
 */
const dealable = () =>
  (Object.keys(MAP_PATHS) as (keyof typeof MAP_PATHS)[]).flatMap(code => {
    if (!(code in COUNTRIES) || !isShapeFriendly(code as ISOCountryCode)) return []
    const ring = largestRing(MAP_PATHS[code])
    const anchor = ring && ring.length >= 3 ? poleOfInaccessibility(ring) : undefined
    const mainland = MAP_REGIONS[code]?.[0] ?? MAP_BOUNDS[code]
    return ring && anchor && mainland ? [{ code, ring, anchor, mainland }] : []
  })

/** Does the crop hold any target land? Sampled on a grid — the requirement is
 *  PARTIAL visibility, not containment: a crop straddling the coast passes. */
const showsLand = (
  ring: ReturnType<typeof largestRing> & {},
  view: { x: number; y: number; width: number; height: number },
  steps = 12
) => {
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const px = view.x + (view.width * (i + 0.5)) / steps
      const py = view.y + (view.height * (j + 0.5)) / steps
      if (ringContains(ring, [px, py])) return true
    }
  }
  return false
}

describe('zoomOutStartView', () => {
  for (const { label, aspect, viewport, berth } of VIEWPORTS) {
    it(`opens on target land for every mapped country — ${label}`, () => {
      const blind: string[] = []
      for (const { code, ring, anchor, mainland } of dealable()) {
        const wide = endFrame(mainland, aspect, berth, viewport)
        const start = zoomOutStartView(mainland, anchor, Math.max(wide.width, wide.height), aspect)
        if (!showsLand(ring, start)) blind.push(code)
      }
      expect(blind).toEqual([])
    })
  }

  it('still crops the country rather than showing it whole', () => {
    // The question survives: a crop that framed the whole outline would hand
    // over the answer at frame 1. Countries smaller than the 10-unit legibility
    // floor are exempt — nothing can crop them and still render — so this
    // asserts the floor is the ONLY reason a country is ever shown whole.
    const givenAway: string[] = []
    for (const { code, mainland, anchor } of dealable()) {
      const wide = endFrame(mainland, 1280 / 800, 176, 800)
      const start = zoomOutStartView(
        mainland,
        anchor,
        Math.max(wide.width, wide.height),
        1280 / 800
      )
      const [, , mainlandWidth, mainlandHeight] = mainland
      const cropped = start.width < mainlandWidth * 0.95 || start.height < mainlandHeight * 0.95
      const atFloor = start.width <= WORLD_BOX.width / 200
      if (!cropped && !atFloor) givenAway.push(code)
    }
    expect(givenAway).toEqual([])
  })

  it('reaches past the inscribed circle, so no country opens on blank fill', () => {
    // The US, Australia and Sudan used to open on uniform interior — no
    // coastline, no border, nothing to read. The pole is the point furthest
    // from any edge, so the crop has to out-reach its own circle.
    const featureless: string[] = []
    for (const { code, mainland, anchor } of dealable()) {
      const wide = endFrame(mainland, 1280 / 800, 176, 800)
      const start = zoomOutStartView(
        mainland,
        anchor,
        Math.max(wide.width, wide.height),
        1280 / 800
      )
      // The SHORTER half-axis must clear the circle: a box whose corners just
      // reach past it still has every side inside, and shows nothing but fill.
      if (Math.min(start.width / 2, start.height / 2) < anchor.radius) featureless.push(code)
    }
    expect(featureless).toEqual([])
  })

  it("guards the premise: the end frame's centre is NOT the country's", () => {
    // If this ever fails the berth stopped displacing the frame, and the sweeps
    // above would be passing for the wrong reason.
    const mainland = MAP_REGIONS.EE![0]!
    const wide = endFrame(mainland, 1280 / 800, 176, 800)
    const frameCentreY = wide.y + wide.height / 2
    const countryCentreY = mainland[1] + mainland[3] / 2
    expect(frameCentreY - countryCentreY).toBeGreaterThan(mainland[3])

    // ...and the old anchor put Estonia's opening frame inside Latvia.
    const ring = largestRing(MAP_PATHS.EE)!
    const anchor = poleOfInaccessibility(ring)!
    const start = zoomOutStartView(mainland, anchor, Math.max(wide.width, wide.height), 1280 / 800)
    const oldStart = {
      ...start,
      x: wide.x + wide.width / 2 - start.width / 2,
      y: frameCentreY - start.height / 2,
    }
    expect(showsLand(ring, oldStart)).toBe(false)
    expect(showsLand(ring, start)).toBe(true)
  })
})

/**
 * Rulers' logo sizing, swept over every mapped country.
 *
 * The bug this pins: a logo used to be a `side x side` SQUARE scaled straight
 * off its country's inscribed radius. Both terms ran wild — Romania's box was
 * 2.3x North Macedonia's LINEARLY, and a square box fitted with `meet` paints
 * a wide wordmark at a third of the area it gives a crest. Compounded, one
 * frame held an 18.5x painted-area spread, which in a mode whose logos ARE the
 * options is a pointer at an answer.
 */
describe('logoBox', () => {
  /** Anchor radii actually seen on the map, smallest to largest. */
  const radiusFor = (isoCode: string) => {
    const ring = largestRing(MAP_PATHS[isoCode as keyof typeof MAP_PATHS])
    return ring ? poleOfInaccessibility(ring)?.radius : undefined
  }
  /** Ratios drawn from the real roster's distribution: p0, p25, p50, p75, p90,
   *  p99 and the extreme tail. */
  const RATIOS = [0.44, 1.0, 1.11, 2.1, 3.36, 6.36, 15.06]

  it('paints equal area regardless of the artwork’s shape', () => {
    // The property the whole fix rests on: at one radius, every shape gets the
    // same painted area. This is what a later "small tweak" would break.
    for (const radius of [0.2, 3.9, 8, 12.4, 65.1]) {
      const areas = RATIOS.map(ratio => logoPaintedArea(radius, ratio))
      const spread = Math.max(...areas) / Math.min(...areas)
      expect(spread).toBeLessThan(1.01)
    }
  })

  it('keeps a whole lineup inside one visual weight class', () => {
    // The regression guard for the reported frame. Every mapped country, each
    // paired with every plausible ratio — the worst pairing a dealer could
    // ever produce must still read as one weight class.
    const areas: number[] = []
    for (const isoCode of Object.keys(MAP_PATHS)) {
      const radius = radiusFor(isoCode)
      if (radius === undefined) continue
      for (const ratio of RATIOS) areas.push(logoPaintedArea(radius, ratio))
    }
    expect(areas.length).toBeGreaterThan(100)
    expect(Math.max(...areas) / Math.min(...areas)).toBeLessThanOrEqual(2.5)
  })

  it('still lets a bigger country wear a bigger mark', () => {
    // Compressed, not flattened: the country-size signal survives, it just
    // stops shouting. Also catches a sign or exponent slip.
    let previous = 0
    for (const radius of [0.2, 1, 3.9, 6.4, 12.4, 18.4, 65.1]) {
      const { side } = logoBox(radius, 1)
      expect(side).toBeGreaterThanOrEqual(previous)
      previous = side
    }
  })

  it('saturates on the rails rather than running away', () => {
    // San Marino (r=0.2) and Russia (r=65) are the roster's extremes.
    expect(logoBox(radiusFor('SM')!, 1).side).toBe(LOGO_MIN_SIDE)
    expect(logoBox(radiusFor('RU')!, 1).side).toBe(LOGO_MAX_SIDE)
  })

  it('fills, never fits, once the artwork outruns the ratio clamp', () => {
    // Past the clamp `meet` is what BREAKS equal area — a 4:1 box holding 15:1
    // art letterboxes to a quarter of itself (France measured 194 against a
    // 324 floor). Those marks must be flagged for `slice`.
    expect(logoBox(10, 15.06).clipped).toBe(true)
    expect(logoBox(10, LOGO_MAX_RATIO * 1.01).clipped).toBe(true)
    expect(logoBox(10, LOGO_MIN_RATIO * 0.99).clipped).toBe(true)
    // ...and everything inside it is fitted whole, artwork intact.
    for (const ratio of [LOGO_MIN_RATIO, 1, 2.1, 3.36, LOGO_MAX_RATIO]) {
      expect(logoBox(10, ratio).clipped).toBe(false)
    }
  })

  it('falls back to a square when the shape is unknown', () => {
    // A stale `.gen`, a logo the backfill could not read, or a pre-existing
    // game: degrade to the old geometry, never to NaN attributes that would
    // blank every mark on the stage.
    for (const ratio of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { width, height, side } = logoBox(10, ratio)
      expect(width).toBe(height)
      expect(Number.isFinite(side)).toBe(true)
      expect(side).toBeGreaterThan(0)
    }
  })

  it('pushes a crowded lineup apart without disowning its countries', () => {
    // The Alps frame: five anchors closer together than the equal-area marks
    // are wide. Austria/Slovenia/Croatia/Italy/Czechia piled into one heap.
    const frame = ['AT', 'CZ', 'IT', 'SI', 'HR']
    const anchored = frame.map(isoCode => {
      const anchor = poleOfInaccessibility(largestRing(MAP_PATHS[isoCode as never])!)!
      const { width, height } = logoBox(anchor.radius, 2.1)
      return { code: isoCode, x: anchor.point[0], y: anchor.point[1], width, height }
    })
    // Count the overlapping AREA, not the pair count: a hairline kiss between
    // two boxes is invisible, while one mark lying across another is the bug.
    // Measuring area is also what stops this passing on a technicality.
    const collision = (list: typeof anchored) => {
      let area = 0
      for (let a = 0; a < list.length; a += 1)
        for (let b = a + 1; b < list.length; b += 1) {
          const one = list[a]!
          const two = list[b]!
          const overlapX = (one.width + two.width) / 2 - Math.abs(one.x - two.x)
          const overlapY = (one.height + two.height) / 2 - Math.abs(one.y - two.y)
          if (overlapX > 0 && overlapY > 0) area += overlapX * overlapY
        }
      return area
    }

    const settled = relaxLogoPlacements(anchored)
    expect(collision(anchored)).toBeGreaterThan(0)
    // The pile clears. A partial settle is what put Slovenia's SDS across
    // Austria's Volkspartei, so "improved" is not the bar.
    expect(collision(settled)).toBeLessThan(collision(anchored) * 0.001)

    // ...and it clears with AIR, not to a hairline kiss. Boxes relaxed to
    // 0.1-unit contact measured as "separated" while the wordmarks inside them
    // still read as one shape on screen — that is the bug this guards.
    for (let a = 0; a < settled.length; a += 1)
      for (let b = a + 1; b < settled.length; b += 1) {
        const one = settled[a]!
        const two = settled[b]!
        const gapX = Math.abs(one.x - two.x) - (one.width + two.width) / 2
        const gapY = Math.abs(one.y - two.y) - (one.height + two.height) / 2
        const air = Math.min((one.height + two.height) / 2, (one.width + two.width) / 2) * 0.1
        expect(
          Math.max(gapX, gapY),
          `${one.code}/${two.code} settled without clear air`
        ).toBeGreaterThan(air)
      }

    // ...and every mark still belongs to its own country: a logo that escaped
    // the pile by sliding onto the neighbour turned a crowded question into a
    // wrong one. Capped per axis against the box's own span.
    for (const [index, placement] of settled.entries()) {
      const origin = anchored[index]!
      expect(Math.abs(placement.x - origin.x)).toBeLessThanOrEqual(origin.width * 0.9 + 0.001)
      expect(Math.abs(placement.y - origin.y)).toBeLessThanOrEqual(origin.height * 0.9 + 0.001)
    }
  })

  it('settles the same way every time', () => {
    // Deterministic: pushes accumulate per pass and apply together, so the
    // layout can never depend on iteration order or on a previous render.
    const boxes = [
      { x: 100, y: 100, width: 30, height: 20 },
      { x: 105, y: 102, width: 30, height: 20 },
      { x: 100, y: 100, width: 25, height: 25 },
    ]
    expect(relaxLogoPlacements(boxes)).toEqual(relaxLogoPlacements(boxes))
    // ...and the input is never mutated — the caller's anchors stay authoritative.
    expect(boxes[0]!.x).toBe(100)
  })

  it('holds the reported Central Europe frame together', () => {
    // The actual bug report: Romania's PNL crest swamping a frame whose other
    // members are small countries wearing wide wordmarks.
    const frame: [string, number][] = [
      ['RO', 1.0],
      ['MK', 1.0],
      ['SK', 3.36],
      ['HU', 2.1],
      ['RS', 3.36],
      ['BG', 1.11],
      ['HR', 1.0],
      ['SI', 1.0],
    ]
    const areas = frame.map(([isoCode, ratio]) => logoPaintedArea(radiusFor(isoCode)!, ratio))
    expect(Math.max(...areas) / Math.min(...areas)).toBeLessThan(2.1)
  })
})

describe('map boxes', () => {
  it('intersects on overlap only, never on a shared edge', () => {
    expect(boxesIntersect([0, 0, 10, 10], [5, 5, 10, 10])).toBe(true)
    expect(boxesIntersect([0, 0, 10, 10], [10, 0, 10, 10])).toBe(false)
    expect(boxesIntersect([0, 0, 10, 10], [20, 20, 1, 1])).toBe(false)
  })

  it('reaches a country through any of its rings, and none without rings', () => {
    const kaliningrad = MAP_REGIONS.RU!.find(([x]) => x < 1100)!
    expect(regionsIntersect(MAP_REGIONS.RU, kaliningrad)).toBe(true)
    expect(regionsIntersect(MAP_REGIONS.RU, [0, 0, 1, 1])).toBe(false)
    expect(regionsIntersect(undefined, [0, 0, 2000, 1001])).toBe(false)
  })

  it('unions boxes to their hull', () => {
    expect(unionBox([[0, 0, 10, 10], [5, 5, 10, 10]])).toEqual([0, 0, 15, 15])
    expect(unionBox([[3, 4, 1, 1]])).toEqual([3, 4, 1, 1])
  })
})
