import type { Redis } from '@upstash/redis'
import { isDraining, type GameServer } from '../server-side'

/**
 * Room sharding: exactly ONE machine owns a game — its sockets, its per-game
 * task queue and its engine timers. The lease lives in Redis under the game's
 * own key family and is enforced at the front door (game-routing.ts replays
 * connections to the owner) and at every timer→queue seam (deferred-task.ts
 * drops a fired timer when ANOTHER machine holds the lease — but a LAPSED
 * lease is re-claimed, not just read, so a fired timer can pull an idle room
 * back to this machine; see machineOwnsGame). Single-machine deploys and
 * local dev have no FLY_MACHINE_ID and skip all of it.
 *
 * The lease heartbeats while sockets are connected and is RELEASED on the
 * deploy drain (graceful-shutdown.ts), so a blue-green flip hands rooms to
 * the new machine immediately. A crash can't release — the TTL is the
 * recovery bound: reconnects retry until the lease lapses, then the first
 * one claims the room wherever it landed and rearmLiveRound revives the
 * timers there.
 */
export const OWNERSHIP_TTL_SECONDS = 90
export const OWNERSHIP_HEARTBEAT_MS = 30_000

export const ownerKey = (gameId: string) => `${gameId}:owner`

/** This machine's identity in the lease; undefined = unsharded (single
 *  machine, local dev, previews), where every ownership check passes. */
export const thisMachineId = (): string | undefined => process.env.FLY_MACHINE_ID || undefined

/**
 * Claim, confirm or refresh the lease in one call. Returns the machine that
 * owns the game AFTER the call: `self` on a fresh claim (SET NX won), an own
 * refresh (TTL renewed), or a reclaim of a lapsed lease; another machine's id
 * when someone else holds it.
 */
export const claimGameOwnership = async (
  redis: Redis,
  gameId: string,
  self: string
): Promise<string> => {
  const key = ownerKey(gameId)
  const claimed = await redis.set(key, self, { nx: true, ex: OWNERSHIP_TTL_SECONDS })
  if (claimed === 'OK') return self

  const owner = await redis.get<string>(key)
  if (owner === self) {
    await redis.expire(key, OWNERSHIP_TTL_SECONDS)
    return self
  }
  if (owner) return owner

  // Lapsed between the NX miss and the read — one retry covers it; losing
  // the retry means another machine just claimed, so report that owner.
  const retried = await redis.set(key, self, { nx: true, ex: OWNERSHIP_TTL_SECONDS })
  if (retried === 'OK') return self
  return (await redis.get<string>(key)) ?? self
}

/** Compare-and-delete: only the holder may release, so a slow shutdown can
 *  never wipe the lease a live machine just claimed. */
const RELEASE_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`

export const releaseGameOwnership = async (
  redis: Redis,
  gameId: string,
  self: string
): Promise<void> => {
  await redis.eval(RELEASE_SCRIPT, [ownerKey(gameId)], [self])
}

/**
 * The timer guard: does this machine (still) hold the game? Unsharded is
 * always yes. A lapsed lease is CLAIMED, not just read — a timer only exists
 * because this machine was running the round, so if nobody else took the room
 * the lease comes back here.
 */
export const machineOwnsGame = async (redis: Redis, gameId: string): Promise<boolean> => {
  const self = thisMachineId()
  if (!self) return true
  return (await claimGameOwnership(redis, gameId, self)) === self
}

/**
 * Keep the lease alive for every game with a connected socket, so a long
 * quiet stretch (everyone watching a reveal, a slow briefing) never lets the
 * room lapse to another machine while its sockets still live here. Stops
 * renewing the moment the deploy drain begins — the drain is about to release
 * these leases and must not race its own heartbeat.
 */
let heartbeatStarted = false

export const startOwnershipHeartbeat = ({ io, redis }: { io: GameServer; redis: Redis }) => {
  const self = thisMachineId()
  if (!self || heartbeatStarted) return
  heartbeatStarted = true

  setInterval(() => {
    if (isDraining()) return
    const gameIds = new Set<string>()
    for (const socket of io.of('/').sockets.values()) {
      if (socket.data.gameId) gameIds.add(socket.data.gameId)
    }
    for (const gameId of gameIds) {
      claimGameOwnership(redis, gameId, self).catch(error =>
        console.error(`Ownership heartbeat failed for ${gameId}`, error)
      )
    }
  }, OWNERSHIP_HEARTBEAT_MS)
}
