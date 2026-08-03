import { describe, expect, it } from 'vitest'
import { bleedBox, COMMIT_DRIFT, OVERLAY_BLEED, OVERLAY_BLEED_INSET } from './use-map-viewbox'

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
