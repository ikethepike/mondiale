import type { H3Event } from 'h3'
import { debugAccess, presentedToken } from '~~/lib/debug-rooms'
import { gameRedisConfig } from './game-redis'

/** Gate a `/debug` route on the configured token: 404 when the endpoint is off. */
export const requireDebugAccess = (event: H3Event) => {
  const access = debugAccess(
    useRuntimeConfig(event).debugToken,
    presentedToken(getRequestHeader(event, 'authorization'), getQuery(event).token as string)
  )
  if (access === 'disabled') throw createError({ statusCode: 404 })
  if (access === 'denied') throw createError({ statusCode: 401 })
}

export const debugRedis = async () => {
  const config = gameRedisConfig()
  if (!config) return undefined
  const { Redis } = await import('@upstash/redis')
  return new Redis(config)
}
