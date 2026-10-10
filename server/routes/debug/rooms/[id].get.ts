import { describeRoom } from '~~/lib/debug-rooms'
import { enqueueGameTask } from '~~/lib/events/server-side'
import { armedTimersFor } from '~~/lib/events/server/seat-cursor'
import { ownerKey, thisMachineId } from '~~/lib/events/server/game-ownership'
import { debugRedis, requireDebugAccess } from '../../../utils/debug-access'

/** One room in full. Replayed to the machine that owns it, so its armed timers are real. */
export default defineEventHandler(async event => {
  requireDebugAccess(event)
  const redis = await debugRedis()
  if (!redis) throw createError({ statusCode: 503 })
  const gameId = getRouterParam(event, 'id')!
  const machine = thisMachineId()
  const owner = machine ? await redis.get<string>(ownerKey(gameId)) : undefined
  if (machine && owner && owner !== machine) {
    setResponseHeader(event, 'fly-replay', `instance=${owner}`)
    setResponseStatus(event, 409)
    return
  }
  // Through the game's queue, like the auditor: never between a save and the
  // arm that follows it in the same task.
  const room = await enqueueGameTask(gameId, () =>
    describeRoom({ redis, gameId, armed: armedTimersFor(gameId) })
  ).catch(() => {
    throw createError({ statusCode: 503 })
  })
  if (!room) throw createError({ statusCode: 404 })
  return { machine, ...room }
})
