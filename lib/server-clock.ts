/**
 * The client's estimate of `serverTime - localTime`. Every server stamp the
 * client renders against (`deadline`, `holdUntil`, `enteredAt`) is server
 * time, so a phone whose clock is minutes off must still count the same
 * window down. Two kinds of evidence:
 *
 * - an ACK round trip brackets the server's stamp between send and receive,
 *   so its midpoint estimate is good to ±rtt/2 — the tightest trip wins;
 * - a SNAPSHOT stamp only bounds the offset from below (the server stamped it
 *   before the wire delay), so the highest one stands in until a round trip
 *   lands.
 */
export interface ClockSample {
  offset: number
  /** Round-trip time in ms; Infinity for a one-way snapshot stamp. */
  rtt: number
}

export const ackSample = (sentAt: number, receivedAt: number, serverNow: number): ClockSample => ({
  offset: serverNow - (sentAt + receivedAt) / 2,
  rtt: Math.max(0, receivedAt - sentAt),
})

export const snapshotSample = (receivedAt: number, serverNow: number): ClockSample => ({
  offset: serverNow - receivedAt,
  rtt: Infinity,
})

/** How many round trips the estimate draws on — a stale minimum ages out. */
export const CLOCK_WINDOW = 8

export const createClockEstimator = (window = CLOCK_WINDOW) => {
  const trips: ClockSample[] = []
  let floor: number | undefined
  return {
    add(sample: ClockSample) {
      if (!Number.isFinite(sample.offset)) return
      if (sample.rtt === Infinity) {
        floor = floor === undefined ? sample.offset : Math.max(floor, sample.offset)
        return
      }
      trips.push(sample)
      if (trips.length > window) trips.shift()
    },
    offset(): number {
      if (!trips.length) return floor ?? 0
      const best = trips.reduce((tightest, trip) => (trip.rtt < tightest.rtt ? trip : tightest))
      return best.offset
    },
    reset() {
      trips.length = 0
      floor = undefined
    },
  }
}
