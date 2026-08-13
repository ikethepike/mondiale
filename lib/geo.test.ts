import { describe, expect, it } from 'vitest'
import { WORLD_BOX, zoomOutStartView, type MapBox } from './geo'
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
        const start = zoomOutStartView(
          mainland,
          anchor,
          Math.max(wide.width, wide.height),
          aspect
        )
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
      const start = zoomOutStartView(mainland, anchor, Math.max(wide.width, wide.height), 1280 / 800)
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
      const start = zoomOutStartView(mainland, anchor, Math.max(wide.width, wide.height), 1280 / 800)
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
    const oldStart = { ...start, x: wide.x + wide.width / 2 - start.width / 2, y: frameCentreY - start.height / 2 }
    expect(showsLand(ring, oldStart)).toBe(false)
    expect(showsLand(ring, start)).toBe(true)
  })
})
