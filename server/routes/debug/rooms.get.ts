import { describeRoom, liveRoomIds } from '~~/lib/debug-rooms'
import { armedTimersFor } from '~~/lib/events/server/seat-cursor'
import { thisMachineId } from '~~/lib/events/server/game-ownership'
import { debugRedis, requireDebugAccess } from '../../utils/debug-access'

/** Every live room's seats, from Redis. The timer column is this machine's only. */
export default defineEventHandler(async event => {
  requireDebugAccess(event)
  const redis = await debugRedis()
  if (!redis) throw createError({ statusCode: 503 })
  const machine = thisMachineId()
  const rooms = await Promise.all(
    (await liveRoomIds(redis)).map(async gameId => {
      const owner = machine ? await redis.get<string>(`${gameId}:owner`) : undefined
      const local = !machine || owner === machine
      const room = await describeRoom({ redis, gameId, armed: local ? armedTimersFor(gameId) : [] })
      return room && { ...room, owner: owner ?? machine, timersRead: local }
    })
  )
  return { machine, rooms: rooms.filter(Boolean) }
})
