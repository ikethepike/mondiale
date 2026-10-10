import type { H3Event } from 'h3'
import { debugAccess, presentedToken } from '~~/lib/debug-rooms'

/** Gate a `/debug` route on the configured token: 404 when the endpoint is off. */
export const requireDebugAccess = (event: H3Event) => {
  const access = debugAccess(
    useRuntimeConfig(event).debugToken,
    presentedToken(getRequestHeader(event, 'authorization'), getQuery(event).token as string)
  )
  if (access === 'disabled') throw createError({ statusCode: 404 })
  if (access === 'denied') throw createError({ statusCode: 401 })
}

/** The Redis the socket server uses, or undefined where none is configured. */
export const debugRedis = async () => {
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, REDIS_PASSWORD } = process.env
  const token = UPSTASH_REDIS_REST_TOKEN ?? REDIS_PASSWORD
  if (!UPSTASH_REDIS_REST_URL || !token) return undefined
  const { Redis } = await import('@upstash/redis')
  return new Redis({ url: UPSTASH_REDIS_REST_URL, token })
}
