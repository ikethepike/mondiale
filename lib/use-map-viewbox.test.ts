import { describe, expect, it } from 'vitest'
import {
  bleedBox,
  COMMIT_DRIFT,
  createCameraLedger,
  overlayBox,
  OVERLAY_BLEED,
  OVERLAY_BLEED_INSET,
  type MapViewBox,
  type ScreenRect,
} from './use-map-viewbox'

describe('camera-bus constants', () => {
  it('bleed exceeds the drift budget, so a ride-along can never show unpainted ground', () => {
    // Both are fractions of their own axis's dimension (drift x vs w, y vs h;
    // bleed likewise per axis), so one inequality covers both axes.
    expect(OVERLAY_BLEED).toBeGreaterThan(COMMIT_DRIFT)
  })

  it('the CSS inset is the same constant', () => {
    expect(OVERLAY_BLEED_INSET).toBe(`-${OVERLAY_BLEED * 100}%`)
  })
})

describe('bleedBox', () => {
  it('grows each side by that axis’s own bleed and stays centred', () => {
    const box = { x: 100, y: 50, w: 200, h: 80 }
    const bled = bleedBox(box)
    expect(bled.x).toBeCloseTo(box.x - box.w * OVERLAY_BLEED)
    expect(bled.y).toBeCloseTo(box.y - box.h * OVERLAY_BLEED)
    expect(bled.w).toBeCloseTo(box.w * (1 + 2 * OVERLAY_BLEED))
    expect(bled.h).toBeCloseTo(box.h * (1 + 2 * OVERLAY_BLEED))
    // Centre preserved — the bleed must never shift the projection.
    expect(bled.x + bled.w / 2).toBeCloseTo(box.x + box.w / 2)
    expect(bled.y + bled.h / 2).toBeCloseTo(box.y + box.h / 2)
  })
})

describe('overlayBox', () => {
  /** Where the MAP paints a map-space point: its viewBox into its painted rect.
   *  The camera keeps the viewBox at the rect's aspect, so this is `none`. */
  const mapProjects = (point: [number, number], vb: MapViewBox, rect: ScreenRect) => ({
    x: rect.x + ((point[0] - vb.x) / vb.w) * rect.width,
    y: rect.y + ((point[1] - vb.y) / vb.h) * rect.height,
  })

  /** Where a BLED OVERLAY paints it: `bleedBox` into `overlayBox`. */
  const overlayProjects = (point: [number, number], vb: MapViewBox, rect: ScreenRect) => {
    const bled = bleedBox(vb)
    const box = overlayBox(rect)
    return {
      x: box.left + ((point[0] - bled.x) / bled.w) * box.width,
      y: box.top + ((point[1] - bled.y) / bled.h) * box.height,
    }
  }

  /** Gran Colombia's camera: the empire's own bounds, padded to screen aspect. */
  const vb: MapViewBox = { x: 500, y: 480, w: 160, h: 130 }
  /** Corners and centre — error from a box mismatch is zero at the centre and
   *  grows outward, so the corners are where a regression actually shows. */
  const probes: [number, number][] = [
    [500, 480],
    [660, 480],
    [500, 610],
    [660, 610],
    [580, 545],
    [512.39, 492.52], // gran-colombia's own NW corner
    [560.95, 542.08], // Bogotá
  ]

  const agreesOn = (rect: ScreenRect) => {
    for (const point of probes) {
      const map = mapProjects(point, vb, rect)
      const overlay = overlayProjects(point, vb, rect)
      expect(overlay.x).toBeCloseTo(map.x, 6)
      expect(overlay.y).toBeCloseTo(map.y, 6)
    }
  }

  it('lands every map point exactly where the map paints it', () => {
    agreesOn({ x: 0, y: 0, width: 1440, height: 900 })
  })

  it('holds under the map’s recede transform — the reported ghost offset', () => {
    // `.game-map` wears `transform: scale(.8)` in every phase the player's own
    // phase class doesn't lift (the /test-views harness has no real player).
    // The overlay is a SIBLING, so it never inherits that scale: measuring the
    // map's post-transform rect is what keeps the two registered.
    const full = { x: 0, y: 0, width: 1440, height: 900 }
    const scale = 0.8
    agreesOn({
      x: full.x + (full.width * (1 - scale)) / 2,
      y: full.y + (full.height * (1 - scale)) / 2,
      width: full.width * scale,
      height: full.height * scale,
    })
  })

  it('holds when the map’s box is offset from the overlay’s parent', () => {
    // The phone /test-views harness pushes the scene down by its bar height
    // while the map still measures the full viewport.
    agreesOn({ x: 0, y: 34, width: 390, height: 810 })
  })

  it('grows the painted rect by exactly the bleed, centre held', () => {
    const rect = { x: 100, y: 50, width: 800, height: 600 }
    const box = overlayBox(rect)
    expect(box.width).toBeCloseTo(rect.width * (1 + 2 * OVERLAY_BLEED))
    expect(box.height).toBeCloseTo(rect.height * (1 + 2 * OVERLAY_BLEED))
    expect(box.left + box.width / 2).toBeCloseTo(rect.x + rect.width / 2)
    expect(box.top + box.height / 2).toBeCloseTo(rect.y + rect.height / 2)
    // Same fraction as bleedBox, so aspect survives and `none` is an identity.
    expect(box.width / box.height).toBeCloseTo(rect.width / rect.height)
  })
})

describe('createCameraLedger', () => {
  const harness = () => {
    let running = false
    let starts = 0
    const ledger = createCameraLedger(
      () => {
        starts += 1
        running = true
      },
      () => {
        running = false
      }
    )
    return { ledger, isRunning: () => running, startCount: () => starts }
  }

  it('starts on the first claim and stops when the last claim is released', () => {
    const { ledger, isRunning } = harness()
    const a = ledger.claim()
    const b = ledger.claim()
    expect(isRunning()).toBe(true)
    ledger.release(a)
    expect(isRunning()).toBe(true)
    ledger.release(b)
    expect(isRunning()).toBe(false)
  })

  it('ignores orphan and repeated releases — the empire-ghost freeze', () => {
    const { ledger, isRunning } = harness()
    const ghost = ledger.claim()
    // A consumer unmounted before it ever mounted releases without a claim
    // (Vue runs onBeforeUnmount unconditionally); a bare counter would hit
    // zero here and cancel the poller under the still-mounted ghost.
    ledger.release(undefined)
    const orphan = ledger.claim()
    ledger.release(orphan)
    ledger.release(orphan)
    expect(isRunning()).toBe(true)
    ledger.release(ghost)
    expect(isRunning()).toBe(false)
  })

  it('never double-starts while claims are live', () => {
    const { ledger, startCount } = harness()
    const a = ledger.claim()
    ledger.claim()
    ledger.claim()
    expect(startCount()).toBe(1)
    ledger.release(a)
    ledger.claim()
    expect(startCount()).toBe(1)
  })
})
