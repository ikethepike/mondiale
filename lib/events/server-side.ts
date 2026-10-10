import type { Server, Socket, DefaultEventsMap } from 'socket.io'

import type {
  ClientEvent,
  ClientEventData,
  ClientEventTarget,
  ServerEventData,
} from '../../types/events.types'
import { type Game, isValidGame } from '../../types/game.types'
import type { Player } from '../../types/player.type'
import type { EventHandler } from '~~/server/middleware/socket.server'
import { secretsKey } from '~~/lib/player-secret'
import type { Redis } from '@upstash/redis'

/** Game-state artifacts (game, secrets, hidden seeds) all expire together. */
export const GAME_STATE_TTL_SECONDS = 172800

/** The one set-then-expire pair for game-state keys — TTL can't be forgotten. */
export const setWithGameTtl = async (redis: Redis, key: string, value: unknown): Promise<void> => {
  await redis.set(key, value)
  await redis.expire(key, GAME_STATE_TTL_SECONDS)
}

/**
 * Per-player bearer secrets, stored under a key SEPARATE from the game so they
 * can never ride a broadcast (which only ever carries the `Game` object). This
 * is what stops a spectator — who sees every player's public id in the
 * snapshot — from binding a socket to someone else's id.
 */
export const fetchSecrets = async (
  redis: Redis,
  gameId: string
): Promise<Record<string, string>> => {
  return (await redis.get<Record<string, string>>(secretsKey(gameId))) ?? {}
}

export const saveSecrets = async (
  redis: Redis,
  gameId: string,
  secrets: Record<string, string>
): Promise<void> => {
  await setWithGameTtl(redis, secretsKey(gameId), secrets)
}

/**
 * Per-socket data set on join. `playerId` binds the socket to the player it
 * may act as — the dispatch layer rejects events whose eventTarget claims a
 * different id, closing the forge-any-player hole.
 */
export interface SocketData {
  playerId?: string
  gameId?: string
}

export type GameSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>
export type GameServer = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>

/**
 * Handlers read-modify-write the whole game to Redis, so two of them running
 * concurrently for the same game clobber each other's saves. One process
 * serves all games — a per-game promise chain fully serializes them. Pacing
 * delays (e.g. "bask in the result for 5s") must NOT hold the chain: run the
 * timer outside and enqueue the follow-up as a fresh task.
 */
const gameQueues = new Map<string, Promise<unknown>>()

/**
 * Deploy drain (graceful-shutdown.ts): once flipped, this process is dying —
 * no new work may start. Incoming socket events go UNANSWERED (the client's
 * ack timeout makes it retry, by which point it has reconnected to the new
 * machine), and freshly fired timers are refused here as the backstop.
 */
let draining = false
export const beginDrain = () => {
  draining = true
}
export const isDraining = () => draining
/** Test-only: in production the drain is process-terminal and never unflips. */
export const resetDrainForTests = () => {
  draining = false
}
/** Live-queue count — drain diagnostics and the prune's test seam. */
export const gameQueueCount = () => gameQueues.size

/** Every LIVE queue's tail, for the drain to wait out in-flight writes. Only
 *  sound once `beginDrain()` has flipped — the spread snapshots the tails at
 *  call time, and it is the drain's refusal of new tasks that makes those
 *  tails final. */
export const settleGameQueues = () => Promise.allSettled([...gameQueues.values()])

/**
 * Seat transitions are stamped onto the game in memory by `advanceSeat`; the
 * save home hands them to the seat cursor module, which journals them and arms
 * each seat's follow-up AFTER the write lands. Injected (not imported) so this
 * module stays a leaf: the cursor module registers itself on load, and only
 * that module can create pending transitions, so the hooks are always present
 * whenever there is something to flush.
 */
export interface SeatSaveHooks {
  afterFetch: (game: Game) => void
  beforeSave: (game: Game) => void
  afterSave: (game: Game, ctx: { io: GameServer; redis: Redis }) => Promise<boolean>
}
let seatSaveHooks: SeatSaveHooks | undefined
export const setSeatSaveHooks = (hooks: SeatSaveHooks) => {
  seatSaveHooks = hooks
}

/**
 * Never save what you don't send: a save carrying seat transitions must reach
 * the wire inside the same queued task. Tracked per game; checked when the
 * task settles, logged as `seat-unsent` if a task ever breaks the rule.
 */
const unsentRevs = new Map<string, number>()
const checkUnsent = (gameId: string) => {
  const rev = unsentRevs.get(gameId)
  if (rev === undefined) return
  unsentRevs.delete(gameId)
  console.error(`seat-unsent ${JSON.stringify({ game: gameId, rev })}`)
}
/** Test seam: the rev a game saved with transitions but has not emitted yet. */
export const unsentRevFor = (gameId: string) => unsentRevs.get(gameId)

export const enqueueGameTask = <T>(gameId: string, task: () => T | Promise<T>): Promise<T> => {
  if (draining) return Promise.reject(new Error(`Draining — refused task for ${gameId}`))
  const tail = gameQueues.get(gameId) ?? Promise.resolve()
  const next = tail.then(async () => {
    try {
      return await task()
    } finally {
      checkUnsent(gameId)
    }
  })
  const settled = next.catch(error => {
    console.error(`Game task failed for ${gameId}`, error)
  })
  gameQueues.set(gameId, settled)
  // A settled tail that is STILL the current tail is a finished queue — drop
  // the entry, so the map tracks live queues rather than every game this
  // process ever touched (same growth argument as rearm-round's sweep).
  settled.then(() => {
    if (gameQueues.get(gameId) === settled) gameQueues.delete(gameId)
  })
  return next
}

export const useServerSideEvents = ({
  io,
  redis,
}: {
  redis: Redis
  socket: GameSocket
  io: GameServer
}) => {
  return {
    emit(eventData: ServerEventData, eventTarget: ClientEventTarget) {
      const unsent = unsentRevs.get(eventTarget.gameId)
      if (unsent !== undefined && 'game' in eventData && (eventData.game.rev ?? 0) >= unsent) {
        unsentRevs.delete(eventTarget.gameId)
      }
      io.in(eventTarget.gameId).emit(
        eventData.event,
        { ...eventData, serverNow: Date.now() },
        eventTarget
      )
    },
    async updateGameState(game: Game) {
      seatSaveHooks?.beforeSave(game)
      // The one save home stamps the snapshot revision: every emit reuses the
      // just-saved object, so the rev rides every wire snapshot for free. The
      // per-game queue serializes saves on the owning machine; a handover race
      // can at worst duplicate a rev, which the client treats as apply.
      game.rev = (game.rev ?? 0) + 1
      // The upstash client (de)serializes JSON itself — store the object as-is
      await setWithGameTtl(redis, game.id, game)
      if (await seatSaveHooks?.afterSave(game, { io, redis })) {
        unsentRevs.set(game.id, game.rev)
      }
    },
    async fetchGame(gameId: string): Promise<Game | undefined> {
      if (!gameId) throw new EvalError('Blank string passed')
      const game = await redis.get<Game>(gameId)
      if (!game) return undefined
      if (!isValidGame(game)) {
        console.warn('Invalid game', game)
        return undefined
      }
      seatSaveHooks?.afterFetch(game)

      return game
    },
  }
}

export interface GameHandlerContext<E extends ClientEvent> {
  game: Game
  player: Player
  server: ReturnType<typeof useServerSideEvents>
  eventData: Extract<ClientEventData, { event: E }>
  eventTarget: ClientEventTarget
  redis: Redis
  socket: GameSocket
  io: GameServer
}

/**
 * Shared guard block for handlers that operate on an existing game:
 * event match → fetch game (throw if missing) → resolve player.
 *
 * `options.player` controls what happens when the player is not in the game:
 * 'require' (default) throws, 'warn' logs and returns, 'optional' proceeds —
 * with 'optional' the handler must not touch `context.player`.
 *
 * Handlers that create games (join) or never fetch one (update-by-index)
 * stay plain EventHandlers.
 */
export const defineGameHandler = <E extends ClientEvent>(
  event: E,
  handle: (context: GameHandlerContext<E>) => void | Promise<void>,
  options: { player?: 'require' | 'warn' | 'optional' } = {}
): EventHandler => {
  return async ({ io, redis, socket, eventData, eventTarget }) => {
    if (eventData.event !== event) return

    const server = useServerSideEvents({ socket, redis, io })

    const { gameId, playerId } = eventTarget
    const game = await server.fetchGame(gameId)
    if (!game) throw new ReferenceError(`Unable to find game: ${gameId}`)

    const player = game.players[playerId]
    if (!player) {
      switch (options.player ?? 'require') {
        case 'require':
          throw new ReferenceError(`Unable to find player with id: ${playerId}`)
        case 'warn':
          return console.warn(`Unable to find player with id: ${playerId}`)
        case 'optional':
          break
      }
    }

    await handle({
      game,
      player: player as Player,
      server,
      eventData: eventData as Extract<ClientEventData, { event: E }>,
      eventTarget,
      redis,
      socket,
      io,
    })
  }
}
