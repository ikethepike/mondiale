import type { Redis } from '@upstash/redis'
import { CLIENT_SIDE_EVENT_HANDLERS } from '~~/lib/events/client-registry'
import { dropsSnapshot } from '~~/lib/events/client/snapshot-revision'
import type { ClientEventData, ClientEventTarget, ServerEnvelope } from '~~/types/events.types'
import { hasGame } from '~~/types/events.types'
import type { Game } from '~~/types/game.types'
import type { SeatJournalEntry } from '~~/types/seat.types'
import type { GameServer, GameSocket } from '../server-side'
import { runClientEvent } from './registry'
import type { EngineContext } from './round-engine'
import { armedTimersFor } from './seat-cursor'
import { onSeatJournal } from './seat-journal'

/**
 * Test scaffolding only — never imported by runtime code. A whole table on a
 * JSON-faithful in-memory Redis (what is saved is what a fetch returns, never
 * the live object), every emit captured with its wire target, every seat
 * journal line collected, and events sent through the real handler registry
 * and the real per-game queue.
 */

export interface CapturedEmit {
  event: string
  payload: ServerEnvelope
  target: ClientEventTarget
}

const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)))

export const fakeTableRedis = () => {
  const values = new Map<string, string>()
  const lists = new Map<string, string[]>()
  const hashes = new Map<string, Record<string, string>>()
  const redis = {
    values,
    lists,
    hashes,
    async get(key: string) {
      const raw = values.get(key)
      return raw === undefined ? null : JSON.parse(raw)
    },
    async set(key: string, value: unknown) {
      values.set(key, JSON.stringify(value))
      return 'OK'
    },
    async expire() {
      return 1
    },
    async del(key: string) {
      values.delete(key)
      lists.delete(key)
      hashes.delete(key)
      return 1
    },
    async rpush(key: string, ...entries: string[]) {
      const list = lists.get(key) ?? []
      list.push(...entries)
      lists.set(key, list)
      return list.length
    },
    async ltrim(key: string, start: number, stop: number) {
      const list = lists.get(key) ?? []
      const from = start < 0 ? Math.max(0, list.length + start) : start
      const to = stop < 0 ? list.length + stop : stop
      lists.set(key, list.slice(from, to + 1))
      return 'OK'
    },
    async lrange(key: string, start: number, stop: number) {
      const list = lists.get(key) ?? []
      const to = stop < 0 ? list.length + stop : stop
      return list.slice(start, to + 1)
    },
    async hset(key: string, entries: Record<string, string>) {
      hashes.set(key, { ...(hashes.get(key) ?? {}), ...entries })
      return Object.keys(entries).length
    },
    async hgetall(key: string) {
      return hashes.get(key) ?? null
    },
    async zadd() {
      return 1
    },
  }
  return redis
}

let tableSeq = 0
/** A game id no other test in the process has used — the queue map and the
 *  armed-timer registry are module state. */
export const uniqueGameId = (prefix = 'table') => `${prefix}-${++tableSeq}-${Date.now()}`

export const createTestTable = async (
  game: Game,
  options: { connected?: readonly string[] } = {}
) => {
  const redis = fakeTableRedis()
  await redis.set(game.id, game)
  const emits: CapturedEmit[] = []
  const journal: SeatJournalEntry[] = []
  const unsubscribe = onSeatJournal(entry => {
    if (entry.game === game.id) journal.push(entry)
  })
  const io = {
    in: () => ({
      emit: (event: string, payload: ServerEnvelope, target: ClientEventTarget) => {
        emits.push({ event, payload: clone(payload), target })
      },
      fetchSockets: async () =>
        (options.connected ?? []).map(playerId => ({
          id: `socket-${playerId}`,
          data: { playerId },
        })),
    }),
    of: () => ({ sockets: new Map() }),
  } as unknown as GameServer

  const ctx = (playerId: string): EngineContext => ({
    io,
    redis: redis as unknown as Redis,
    socket: {} as GameSocket,
    eventTarget: { gameId: game.id, playerId },
  })

  /** One client event the way the socket dispatch runs it: recorded, then queued. */
  const send = async (playerId: string, eventData: ClientEventData) => {
    await runClientEvent({ ...ctx(playerId), eventData })
  }

  const read = async (): Promise<Game> => clone((await redis.get(game.id)) as Game)

  return {
    id: game.id,
    redis,
    io,
    emits,
    journal,
    ctx,
    send,
    read,
    armed: () => armedTimersFor(game.id),
    dispose: unsubscribe,
  }
}

export type TestTable = Awaited<ReturnType<typeof createTestTable>>

/**
 * A client's view of the game, rebuilt from the emit stream through the REAL
 * client appliers behind the REAL dispatch gate — so the harness and the
 * client can never disagree about what an emit does.
 */
export const createClientMirror = (playerId: string, joined: Game) => {
  const gameStore = {
    game: clone(joined) as Game | undefined,
    manhunt: undefined,
    playerId,
    board: { notices: [], cheers: [] },
    map: { liveGuesses: [] },
  }
  const apply = (emit: CapturedEmit) => {
    if (!hasGame(emit.payload)) return
    const configuration = CLIENT_SIDE_EVENT_HANDLERS[emit.payload.event]
    if (dropsSnapshot(configuration.snapshotScope, gameStore.game, emit.payload)) return
    void configuration.handler({
      eventKey: emit.payload.event,
      payload: clone(emit.payload),
      gameStore: gameStore as never,
      eventTarget: emit.target,
      playerId,
    })
  }
  return { gameStore, apply, game: () => gameStore.game! }
}

/**
 * The dealers' deferred modules, loaded up front. A cold dynamic import
 * resolves on real I/O, so under fake timers a game burst through minutes of
 * virtual time leaves the deal — and the whole game queue behind it — waiting.
 */
export const warmDeferredModules = () =>
  Promise.all([
    import('~~/lib/challenges/final-challenge'),
    import('~~/lib/sunset-window'),
    import('~~/lib/charts'),
    import('~~/lib/empires'),
    import('~~/lib/migration'),
    import('~~/lib/pyramids'),
    import('~~/lib/timeline'),
    import('~~/lib/trends-data'),
    import('~~/data/conflict-events.gen'),
    import('~~/data/conflict-profiles.gen'),
    import('~~/data/conflicts.gen'),
    import('~~/data/empires.gen'),
    import('~~/data/flag-meanings.gen'),
    import('~~/data/map-hd.gen'),
    import('~~/data/map.gen'),
    import('~~/data/recognition.gen'),
    import('~~/data/water-facts.gen'),
    import('~~/data/water.gen'),
  ])
