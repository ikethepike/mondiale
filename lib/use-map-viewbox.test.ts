import { describe, expect, it } from 'vitest'
import {
  bleedBox,
  COMMIT_DRIFT,
  createCameraLedger,
  OVERLAY_BLEED,
  OVERLAY_BLEED_INSET,
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
