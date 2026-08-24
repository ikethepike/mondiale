import { describe, expect, it } from 'vitest'
import { pinchFrame, pinchStep, scaleAbout, usePinchPan, type PinchPoint } from './use-pinch-pan'

const BOUNDS = { min: 0.2, max: 1.25 }

/** Where a point of the object lands on the stage, under a given state. */
const project = (state: { scale: number; offset: PinchPoint }, local: PinchPoint): PinchPoint => [
  state.offset[0] + state.scale * local[0],
  state.offset[1] + state.scale * local[1],
]

/** The object point currently sitting under a stage point. */
const under = (state: { scale: number; offset: PinchPoint }, stage: PinchPoint): PinchPoint => [
  (stage[0] - state.offset[0]) / state.scale,
  (stage[1] - state.offset[1]) / state.scale,
]

describe('pinchFrame', () => {
  it('reads a single pointer as a place with no spread', () => {
    const frame = pinchFrame([[3, -4]])
    expect(frame.centre).toEqual([3, -4])
    expect(frame.spread).toBe(0)
  })

  it('reads two pointers as their midpoint and half their gap', () => {
    const frame = pinchFrame([
      [0, 0],
      [10, 0],
    ])
    expect(frame.centre).toEqual([5, 0])
    expect(frame.spread).toBe(5)
  })

  it('generalises past two fingers', () => {
    const frame = pinchFrame([
      [0, 0],
      [4, 0],
      [2, 6],
    ])
    expect(frame.centre[0]).toBeCloseTo(2)
    expect(frame.centre[1]).toBeCloseTo(2)
    expect(frame.spread).toBeGreaterThan(0)
  })
})

describe('pinchStep', () => {
  const state = { scale: 1, offset: [0, 0] as PinchPoint }

  it('pans, and only pans, on one finger', () => {
    const next = pinchStep(state, pinchFrame([[0, 0]]), pinchFrame([[6, -2]]), BOUNDS)
    expect(next.scale).toBe(1)
    expect(next.offset).toEqual([6, -2])
  })

  it('holds the pinched point still while the object grows around it', () => {
    // Two fingers 4 apart at (10, 0), spreading to 8 apart in place
    const from = pinchFrame([
      [8, 0],
      [12, 0],
    ])
    const to = pinchFrame([
      [6, 0],
      [14, 0],
    ])
    const pinched = under(state, [10, 0])
    const next = pinchStep(state, from, to, BOUNDS)

    expect(next.scale).toBeCloseTo(2 * state.scale > BOUNDS.max ? BOUNDS.max : 2)
    // Whatever the clamp did to the scale, the point under the fingers stayed
    expect(project(next, pinched)[0]).toBeCloseTo(10)
    expect(project(next, pinched)[1]).toBeCloseTo(0)
  })

  it('scales and travels together when the fingers do both', () => {
    const start = { scale: 1, offset: [0, 0] as PinchPoint }
    const from = pinchFrame([
      [0, 0],
      [4, 0],
    ])
    const to = pinchFrame([
      [20, 10],
      [22, 10],
    ])
    const next = pinchStep(start, from, to, BOUNDS)
    // Fingers halved their gap and moved to (21, 10)
    expect(next.scale).toBeCloseTo(0.5)
    expect(project(next, under(start, from.centre))).toEqual([
      expect.closeTo(21, 6),
      expect.closeTo(10, 6),
    ])
  })

  it('stops growing at the stop instead of sliding out from under the fingers', () => {
    const start = { scale: 1.2, offset: [0, 0] as PinchPoint }
    const from = pinchFrame([
      [4, 0],
      [8, 0],
    ])
    // A four-fold spread, far past max
    const to = pinchFrame([
      [-2, 0],
      [14, 0],
    ])
    const pinched = under(start, [6, 0])
    const next = pinchStep(start, from, to, BOUNDS)

    expect(next.scale).toBe(BOUNDS.max)
    // The anchor is honoured against the scale actually applied, so the pinched
    // point tracks the fingers' new centre rather than drifting off on its own
    expect(project(next, pinched)[0]).toBeCloseTo(6)
  })

  it('refuses to divide by a spread that was never there', () => {
    const from = pinchFrame([[0, 0]])
    const to = pinchFrame([
      [0, 0],
      [10, 0],
    ])
    // A second finger LANDING is not a pinch — the frame is rebuilt on the
    // count change, so this shape must never invent a scale factor
    expect(pinchStep(state, from, to, BOUNDS).scale).toBe(1)
  })
})

describe('scaleAbout', () => {
  it('is a pinch with no fingers: the anchor holds', () => {
    const start = { scale: 0.8, offset: [3, -1] as PinchPoint }
    const cursor: PinchPoint = [12, 5]
    const pointed = under(start, cursor)
    const next = scaleAbout(start, 1.25, cursor, BOUNDS)

    expect(next.scale).toBeCloseTo(1)
    expect(project(next, pointed)[0]).toBeCloseTo(cursor[0])
    expect(project(next, pointed)[1]).toBeCloseTo(cursor[1])
  })
})

describe('usePinchPan', () => {
  it('does not jump when a pinch becomes a drag', () => {
    const gesture = usePinchPan(BOUNDS)
    gesture.start(1, [0, 0])
    gesture.start(2, [10, 0])
    gesture.move(1, [-5, 0])
    gesture.move(2, [15, 0])

    const scaled = gesture.scale.value
    const parked = [...gesture.offset.value]

    // Second finger lifts, first holds perfectly still
    gesture.end(2)
    gesture.move(1, [-5, 0])

    expect(gesture.scale.value).toBe(scaled)
    expect(gesture.offset.value).toEqual(parked)
  })

  it('keeps the object on the stage', () => {
    const gesture = usePinchPan({ ...BOUNDS, reach: () => [4, 2] })
    gesture.start(1, [0, 0])
    gesture.move(1, [900, -900])

    expect(gesture.offset.value).toEqual([4, -2])
  })

  it('announces the first pointer of a gesture, not every one', () => {
    let starts = 0
    const gesture = usePinchPan({ ...BOUNDS, onStart: () => starts++ })
    gesture.start(1, [0, 0])
    gesture.start(2, [4, 0])
    gesture.move(1, [1, 0])
    expect(starts).toBe(1)

    gesture.end(1)
    gesture.end(2)
    gesture.start(3, [0, 0])
    expect(starts).toBe(2)
  })

  it('counts the fingers on the stage', () => {
    const gesture = usePinchPan(BOUNDS)
    expect(gesture.pointerCount.value).toBe(0)
    gesture.start(1, [0, 0])
    gesture.start(2, [4, 0])
    expect(gesture.pointerCount.value).toBe(2)
    gesture.end(1)
    expect(gesture.pointerCount.value).toBe(1)
  })

  it('ignores a pointer it never saw start', () => {
    const gesture = usePinchPan(BOUNDS)
    gesture.move(9, [50, 50])
    expect(gesture.offset.value).toEqual([0, 0])
  })

  it('scaleTo lands exactly on the asked-for scale, inside the stops', () => {
    const gesture = usePinchPan(BOUNDS)
    gesture.scaleTo(0.44)
    expect(gesture.scale.value).toBeCloseTo(0.44)
    gesture.scaleTo(99)
    expect(gesture.scale.value).toBe(BOUNDS.max)
    gesture.scaleTo(0)
    expect(gesture.scale.value).toBe(BOUNDS.min)
  })
})
