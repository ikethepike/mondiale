import { exportRoom } from '~~/lib/debug-rooms'
import { debugRedis, requireDebugAccess } from '../../../../utils/debug-access'

/** The replay bundle: a round-start checkpoint (the latest, or `?from=earliest`) and every event and draw after it. */
export default defineEventHandler(async event => {
  requireDebugAccess(event)
  const redis = await debugRedis()
  if (!redis) throw createError({ statusCode: 503 })
  const from = getQuery(event).from === 'earliest' ? 'earliest' : 'latest'
  return exportRoom(redis, getRouterParam(event, 'id')!, from)
})
