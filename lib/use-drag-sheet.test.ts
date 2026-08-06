import { describe, expect, it } from 'vitest'
import { FLICK_PX_PER_MS, releaseVelocity, VELOCITY_WINDOW_MS } from './use-drag-sheet'

/**
 * The flick threshold decides whether a release is carried onward a stop or
 * springs to the nearest one, so a wrong velocity is a sheet that moves
 * somewhere the finger never asked for.
 */
describe('releaseVelocity', () => {
  it('reads a fast throw as a flick', () => {
    const samples = [
      { p: 0, t: 1000 },
      { p: 40, t: 1020 },
      { p: 90, t: 1040 },
    ]
    expect(releaseVelocity(samples, 1040)).toBeGreaterThan(FLICK_PX_PER_MS)
  })

  it('reads a slow drag as no flick', () => {
    const samples = [
      { p: 0, t: 1000 },
      { p: 4, t: 1100 },
      { p: 9, t: 1200 },
    ]
    expect(Math.abs(releaseVelocity(samples, 1200))).toBeLessThan(FLICK_PX_PER_MS)
  })

  it('signs an upward drag negative', () => {
    const samples = [
      { p: 90, t: 1000 },
      { p: 0, t: 1040 },
    ]
    expect(releaseVelocity(samples, 1040)).toBeLessThan(0)
  })

  // The bug this window exists for: pointermove stops firing the instant the
  // finger stops, so the sample buffer keeps its pre-pause speed. A drag that
  // moved fast, HELD, then lifted would be thrown onward from a standstill.
  it('ignores a fast run the finger had already stopped before releasing', () => {
    const samples = [
      { p: 0, t: 1000 },
      { p: 90, t: 1040 },
    ]
    const released = 1040 + VELOCITY_WINDOW_MS + 1
    expect(releaseVelocity(samples, released)).toBe(0)
  })

  it('still flicks when the pause is shorter than the window', () => {
    const samples = [
      { p: 0, t: 1000 },
      { p: 90, t: 1040 },
    ]
    expect(releaseVelocity(samples, 1040 + VELOCITY_WINDOW_MS - 1)).toBeGreaterThan(FLICK_PX_PER_MS)
  })

  it('measures only the samples inside the window, not the whole buffer', () => {
    // A slow approach then a late dart: the dart is the throw, and averaging
    // the stale head of the buffer into it would swallow the flick.
    const samples = [
      { p: 0, t: 900 },
      { p: 10, t: 1000 },
      { p: 60, t: 1040 },
      { p: 110, t: 1070 },
    ]
    expect(releaseVelocity(samples, 1070)).toBeGreaterThan(FLICK_PX_PER_MS)
  })

  it('is zero for an empty or single-sample buffer', () => {
    expect(releaseVelocity([], 1000)).toBe(0)
    expect(releaseVelocity([{ p: 10, t: 1000 }], 1000)).toBe(0)
  })

  it('keeps the whole-buffer reading when no release time is given', () => {
    const samples = [
      { p: 0, t: 1000 },
      { p: 90, t: 1040 },
    ]
    expect(releaseVelocity(samples)).toBeCloseTo(2.25)
  })
})
