import { exportRoom } from '~~/lib/debug-rooms'
import { debugRedis, requireDebugAccess } from '../../../../utils/debug-access'

/** The replay bundle: the latest round-start checkpoint and every event and deal after it. */
export default defineEventHandler(async event => {
  requireDebugAccess(event)
  const redis = await debugRedis()
  if (!redis) throw createError({ statusCode: 503 })
  return exportRoom(redis, getRouterParam(event, 'id')!)
})
