/** The Redis every game reads and writes — undefined where no token is configured. */
export const gameRedisConfig = (): { url: string; token: string } | undefined => {
  const { REDIS_PASSWORD, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env
  const token = UPSTASH_REDIS_REST_TOKEN ?? REDIS_PASSWORD
  if (!token) return undefined
  return { url: UPSTASH_REDIS_REST_URL ?? 'https://pure-ghost-24372.upstash.io', token }
}
