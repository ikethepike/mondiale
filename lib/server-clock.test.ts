import { describe, expect, it } from 'vitest'
import { ackSample, CLOCK_WINDOW, createClockEstimator, snapshotSample } from '~~/lib/server-clock'

const MINUTE = 60_000

/** A round trip against a server whose clock reads `local + skew`. */
const trip = (skew: number, sentAt: number, outbound: number, inbound: number) =>
  ackSample(sentAt, sentAt + outbound + inbound, sentAt + outbound + skew)

describe('ackSample', () => {
  it('centres the estimate on the round trip', () => {
    expect(ackSample(1000, 1200, 5100)).toEqual({ offset: 4000, rtt: 200 })
  })

  it('is exact on a symmetric trip', () => {
    expect(trip(3 * MINUTE, 10_000, 40, 40).offset).toBe(3 * MINUTE)
  })

  it('never reports a negative round trip', () => {
    expect(ackSample(2000, 1990, 2000).rtt).toBe(0)
  })
})

describe('snapshotSample', () => {
  it('is a one-way lower bound', () => {
    expect(snapshotSample(1000, 61_000)).toEqual({ offset: 60_000, rtt: Infinity })
  })
})

describe('createClockEstimator', () => {
  it('reads zero before any evidence', () => {
    expect(createClockEstimator().offset()).toBe(0)
  })

  it.each([5 * MINUTE, -5 * MINUTE, 90 * MINUTE, 0])(
    'converges on a constant skew of %ims',
    skew => {
      const clock = createClockEstimator()
      for (let index = 0; index < 20; index++) {
        clock.add(trip(skew, index * 1000, 30 + (index % 3) * 10, 30 + (index % 3) * 10))
      }
      expect(clock.offset()).toBe(skew)
    }
  )

  it('trusts the tightest round trip in the window', () => {
    const clock = createClockEstimator()
    clock.add({ offset: 500, rtt: 400 })
    clock.add({ offset: 120, rtt: 20 })
    clock.add({ offset: -300, rtt: 900 })
    expect(clock.offset()).toBe(120)
  })

  it('stays within half the tightest round trip under asymmetric jitter', () => {
    const skew = 2 * MINUTE
    const clock = createClockEstimator()
    const legs = [
      [300, 20],
      [15, 15],
      [25, 600],
      [400, 400],
      [10, 250],
    ]
    legs.forEach(([outbound, inbound], index) =>
      clock.add(trip(skew, index * 1000, outbound, inbound))
    )
    expect(Math.abs(clock.offset() - skew)).toBeLessThanOrEqual(15)
  })

  it('ages the tightest trip out after the window', () => {
    const clock = createClockEstimator()
    clock.add({ offset: 999, rtt: 1 })
    for (let index = 0; index < CLOCK_WINDOW - 1; index++) clock.add({ offset: 50, rtt: 100 })
    expect(clock.offset()).toBe(999)
    clock.add({ offset: 50, rtt: 100 })
    expect(clock.offset()).toBe(50)
  })

  it('honours a custom window', () => {
    const clock = createClockEstimator(2)
    clock.add({ offset: 1, rtt: 1 })
    clock.add({ offset: 2, rtt: 50 })
    clock.add({ offset: 3, rtt: 60 })
    expect(clock.offset()).toBe(2)
  })

  it('falls back to the highest snapshot stamp until a round trip lands', () => {
    const clock = createClockEstimator()
    clock.add(snapshotSample(1000, 1000 + 3 * MINUTE - 80))
    clock.add(snapshotSample(2000, 2000 + 3 * MINUTE - 20))
    clock.add(snapshotSample(3000, 3000 + 3 * MINUTE - 200))
    expect(clock.offset()).toBe(3 * MINUTE - 20)

    clock.add(trip(3 * MINUTE, 4000, 50, 50))
    expect(clock.offset()).toBe(3 * MINUTE)
  })

  it('lets a snapshot never override a round trip', () => {
    const clock = createClockEstimator()
    clock.add(trip(-MINUTE, 0, 40, 40))
    clock.add(snapshotSample(5000, 5000 + 10 * MINUTE))
    expect(clock.offset()).toBe(-MINUTE)
  })

  it('ignores non-finite samples', () => {
    const clock = createClockEstimator()
    clock.add({ offset: 42, rtt: 10 })
    clock.add({ offset: NaN, rtt: 1 })
    clock.add({ offset: Infinity, rtt: Infinity })
    expect(clock.offset()).toBe(42)
  })

  it('forgets everything on reset', () => {
    const clock = createClockEstimator()
    clock.add({ offset: 42, rtt: 10 })
    clock.add(snapshotSample(0, 7))
    clock.reset()
    expect(clock.offset()).toBe(0)
  })
})
