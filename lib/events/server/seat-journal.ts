import type { Redis } from '@upstash/redis'
import type { SeatJournalEntry, SeatRender } from '~~/types/seat.types'
import { GAME_STATE_TTL_SECONDS } from '../server-side'

/** How many transitions a game's ring keeps — enough for a whole short game. */
export const SEAT_JOURNAL_RING = 1000
/** Inbound events and deals kept for replay, per game. */
export const SEAT_EVENT_RING = 2000

export const journalKey = (gameId: string) => `${gameId}:journal`
export const eventsKey = (gameId: string) => `${gameId}:events`
export const rendersKey = (gameId: string) => `${gameId}:renders`
export const checkpointKey = (gameId: string) => `${gameId}:checkpoint`

type ListRedis = Pick<Redis, 'rpush' | 'ltrim' | 'expire'>
const supportsLists = (redis: unknown): redis is ListRedis =>
  typeof (redis as Partial<ListRedis>).rpush === 'function' &&
  typeof (redis as Partial<ListRedis>).ltrim === 'function'

type JournalListener = (entry: SeatJournalEntry) => void
const listeners = new Set<JournalListener>()

/** Tap every journal line in-process (tests, the replay harness). Returns the unsubscribe. */
export const onSeatJournal = (listener: JournalListener): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const logsQuietly = () =>
  typeof process !== 'undefined' && !!process.env?.VITEST && !process.env?.SEAT_JOURNAL_LOG

export const logSeatLine = (tag: string, payload: object) => {
  if (logsQuietly()) return
  console.log(`${tag} ${JSON.stringify(payload)}`)
}

const pushRing = async (redis: unknown, key: string, values: object[], keep: number) => {
  if (!values.length || !supportsLists(redis)) return
  await redis.rpush(key, ...values.map(value => JSON.stringify(value)))
  await redis.ltrim(key, -keep, -1)
  await redis.expire(key, GAME_STATE_TTL_SECONDS)
}

/**
 * Every seat transition, once saved: one structured log line each (Fly's log
 * search finds a game's whole sequence), and the non-progress ones into the
 * game's Redis ring so `/debug/rooms` can show it after the fact.
 */
export const recordSeatJournal = async (redis: unknown, entries: SeatJournalEntry[]) => {
  if (!entries.length) return
  for (const entry of entries) {
    logSeatLine('seat-journal', entry)
    for (const listener of listeners) listener(entry)
  }
  const gameId = entries[0].game
  try {
    await pushRing(
      redis,
      journalKey(gameId),
      entries.filter(entry => !entry.progress),
      SEAT_JOURNAL_RING
    )
  } catch (error) {
    console.error(`seat-journal ring write failed for ${gameId}`, error)
  }
}

/** One recorded input for deterministic replay: a client event, a bot act, or a deal. */
export type SeatEventRecord =
  | { kind: 'event'; at: number; actor: string; event: string; data: unknown }
  | {
      kind: 'deal'
      at: number
      seat?: string
      what: 'round' | 'moves' | 'final-replacement'
      value: unknown
    }

type EventListener = (gameId: string, record: SeatEventRecord) => void
const eventListeners = new Set<EventListener>()
export const onSeatEvent = (listener: EventListener): (() => void) => {
  eventListeners.add(listener)
  return () => eventListeners.delete(listener)
}

export const recordSeatEvent = async (redis: unknown, gameId: string, record: SeatEventRecord) =>
  recordSeatEvents(redis, gameId, [record])

const recordSeatEvents = async (redis: unknown, gameId: string, records: SeatEventRecord[]) => {
  if (!records.length) return
  for (const record of records) {
    for (const listener of eventListeners) listener(gameId, record)
  }
  try {
    await pushRing(redis, eventsKey(gameId), records, SEAT_EVENT_RING)
  } catch (error) {
    console.error(`seat-events ring write failed for ${gameId}`, error)
  }
}

/**
 * Deals are made inside a task before its save: buffer them on the game and
 * let the save hook flush them, so a deal is only recorded if the save that
 * carries it actually lands.
 */
const bufferedDeals = new WeakMap<object, SeatEventRecord[]>()
export const bufferDeal = (
  game: object,
  deal: Omit<Extract<SeatEventRecord, { kind: 'deal' }>, 'kind' | 'at'>
) => {
  const records = bufferedDeals.get(game) ?? []
  records.push({ kind: 'deal', at: Date.now(), ...deal })
  bufferedDeals.set(game, records)
}
export const flushDeals = async (redis: unknown, game: { id: string }) => {
  const records = bufferedDeals.get(game) ?? []
  bufferedDeals.delete(game)
  await recordSeatEvents(redis, game.id, records)
}

type RenderRedis = Pick<Redis, 'hset' | 'expire'>
const supportsHashes = (redis: unknown): redis is RenderRedis =>
  typeof (redis as Partial<RenderRedis>).hset === 'function'

/** Per-viewer render acks: a side key, never the game, so an ack can't bump `rev`. */
export const recordSeatRender = async (redis: unknown, gameId: string, render: SeatRender) => {
  logSeatLine('seat-rendered', { game: gameId, ...render })
  if (!supportsHashes(redis)) return
  await redis.hset(rendersKey(gameId), { [render.viewer]: JSON.stringify(render) })
  await redis.expire(rendersKey(gameId), GAME_STATE_TTL_SECONDS)
}
