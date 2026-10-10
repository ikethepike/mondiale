import { readonly, ref, type Ref } from 'vue'
import { ackSample, createClockEstimator, snapshotSample } from '~~/lib/server-clock'

/**
 * Server time on the client: ONE shared ticker and one offset estimate for
 * the whole app. Every countdown, hold and sub-beat a view renders reads
 * `now` here — the server's stamps decide what is on screen, never a local
 * timer.
 */
export const SERVER_NOW_TICK_MS = 100

const estimator = createClockEstimator()
const offset = ref(0)
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined

const refresh = () => {
  offset.value = estimator.offset()
  now.value = Date.now() + offset.value
}

/** A server stamp arrived on a snapshot. */
export const noteSnapshotClock = (serverNow: number | undefined) => {
  if (typeof serverNow !== 'number') return
  estimator.add(snapshotSample(Date.now(), serverNow))
  refresh()
}

/** An ack came back carrying the server's clock: the precise sample. */
export const noteAckClock = (sentAt: number, serverNow: number | undefined) => {
  if (typeof serverNow !== 'number') return
  estimator.add(ackSample(sentAt, Date.now(), serverNow))
  refresh()
}

/** The local clock reading a round trip starts from. */
export const clientSendTime = () => Date.now()

/** Server time right now, outside any reactive scope. */
export const readServerNow = () => Date.now() + offset.value

export const useServerNow = (): { now: Readonly<Ref<number>>; offset: Readonly<Ref<number>> } => {
  if (import.meta.client && !ticker) {
    ticker = setInterval(refresh, SERVER_NOW_TICK_MS)
  }
  return { now: readonly(now), offset: readonly(offset) }
}
