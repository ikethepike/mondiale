import type { Server, Socket, DefaultEventsMap } from 'socket.io'

import type { ClientEventTarget, ServerEventData } from '../../types/events.types'
import { type Game, isValidGame } from '../../types/game.types'
import type { Redis } from '@upstash/redis'

const TWO_DAYS_IN_SECONDS = 172800

export const useServerSideEvents = ({
  io,
  redis,
}: {
  redis: Redis
  socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>
  io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>
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
