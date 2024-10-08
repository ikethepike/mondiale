import { Server, Socket } from 'socket.io'

import type { DefaultEventsMap } from 'socket.io'
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
      await redis.set(game.id, JSON.stringify(game))
      await redis.expire(game.id, TWO_DAYS_IN_SECONDS)
    },
    async fetchGame(gameId: string): Promise<Game | undefined> {
      if (!gameId) throw new EvalError('Blank string passed')
      const response = await redis.get<string>(gameId)
      if (!response) return undefined
      const game = JSON.parse(response)
      if (!isValidGame(game)) {
        console.warn('Invalid game', game)
        return undefined
      }

      return game
    },
  }
}
