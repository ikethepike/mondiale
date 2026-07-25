/**
 * `playerId` is the PUBLIC identifier — it keys every client-side render and
 * rides in every game snapshot, so anyone in the room (players AND spectators)
 * can read it off the wire. The secret is the PRIVATE bearer token that proves
 * a socket may act as that id. It lives under a separate redis key that never
 * enters a broadcast (see server-side.ts), so knowing an id is not enough to
 * impersonate its owner.
 */
export const secretsKey = (gameId: string) => `${gameId}:secrets`

export type SecretVerdict = 'ok' | 'claim' | 'open' | 'reject'

/**
 * Decide whether a socket presenting `presented` may bind to an id whose
 * recorded secret is `recorded`:
 *
 * - 'claim'  — no secret on file and one was presented: this is a first join,
 *              record it.
 * - 'ok'     — the presented secret matches the recorded one: bind.
 * - 'open'   — no secret on file and none presented: bind unverified. Cached
 *              pre-secret clients land here, so the id stays claimable and the
 *              hole closes for each player the moment they load a build that
 *              sends a secret.
 * - 'reject' — a secret is on file and the presented one is missing or wrong.
 *              An impersonation attempt (or the narrow post-deploy race where
 *              an attacker claimed the slot before the owner reconnected).
 *
 * The critical case is ('secret', undefined) → 'reject': once a secret is on
 * file, simply omitting one must NOT bind, or an attacker could sidestep the
 * check by sending nothing.
 */
export const verifyPlayerSecret = (
  recorded: string | undefined,
  presented: string | undefined
): SecretVerdict => {
  if (recorded) return presented === recorded ? 'ok' : 'reject'
  return presented ? 'claim' : 'open'
}
