import { describeRoom, liveRoomIds } from '~~/lib/debug-rooms'
import { enqueueGameTask } from '~~/lib/events/server-side'
import { armedTimersFor } from '~~/lib/events/server/seat-cursor'
import { ownerKey, thisMachineId } from '~~/lib/events/server/game-ownership'
import { debugRedis, requireDebugAccess } from '../../utils/debug-access'

/** Every live room's seats, from Redis. Timers (and the timer invariants) only for rooms this machine owns. */
export default defineEventHandler(async event => {
  requireDebugAccess(event)
  const redis = await debugRedis()
  if (!redis) throw createError({ statusCode: 503 })
  const machine = thisMachineId()
  const rooms = await Promise.all(
    (await liveRoomIds(redis)).map(async gameId => {
      const owner = machine ? await redis.get<string>(ownerKey(gameId)) : undefined
      const local = !machine || owner === machine
      const room = local
        ? await enqueueGameTask(gameId, () =>
            describeRoom({ redis, gameId, armed: armedTimersFor(gameId) })
          ).catch(() => undefined)
        : await describeRoom({ redis, gameId })
      return room && { ...room, owner: owner ?? machine, timersRead: local }
    })
  )
  return { machine, rooms: rooms.filter(Boolean) }
})
