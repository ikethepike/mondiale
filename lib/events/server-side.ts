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
import type { Redis } from '@upstash/redis'

const TWO_DAYS_IN_SECONDS = 172800

/**
 * Handlers read-modify-write the whole game to Redis, so two of them running
 * concurrently for the same game clobber each other's saves. One process
 * serves all games — a per-game promise chain fully serializes them. Pacing
 * delays (e.g. "bask in the result for 5s") must NOT hold the chain: run the
 * timer outside and enqueue the follow-up as a fresh task.
 */
const gameQueues = new Map<string, Promise<unknown>>()

export const enqueueGameTask = <T>(gameId: string, task: () => T | Promise<T>): Promise<T> => {
  const tail = gameQueues.get(gameId) ?? Promise.resolve()
  const next = tail.then(task)
  gameQueues.set(
    gameId,
    next.catch(error => console.error(`Game task failed for ${gameId}`, error))
  )
  return next
}

export const useServerSideEvents = ({
  io,
  redis,
}: {
  redis: Redis
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, unknown>
  io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, unknown>
}) => {
  return {
    emit(eventData: ServerEventData, eventTarget: ClientEventTarget) {
      io.in(eventTarget.gameId).emit(eventData.event, eventData, eventTarget)
    },
    async updateGameState(game: Game) {
      // The upstash client (de)serializes JSON itself — store the object as-is
      await redis.set(game.id, game)
      await redis.expire(game.id, TWO_DAYS_IN_SECONDS)
    },
    async fetchGame(gameId: string): Promise<Game | undefined> {
      if (!gameId) throw new EvalError('Blank string passed')
      const game = await redis.get<Game>(gameId)
      if (!game) return undefined
      if (!isValidGame(game)) {
        console.warn('Invalid game', game)
        return undefined
      }

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
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, unknown>
  io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, unknown>
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
