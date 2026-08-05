import type { Redis } from '@upstash/redis'
import { beginDrain, settleGameQueues, type GameServer } from '../server-side'
import { releaseGameOwnership, thisMachineId } from './game-ownership'

/** In-flight writes get this long to settle before the leases move — must fit
 *  inside fly.toml's kill_timeout with room for the release round-trips. */
export const DRAIN_SETTLE_CAP_MS = 3000

let registered = false

/**
 * The deploy drain. A blue-green flip moves traffic to the new machine and
 * then signals this one; without a drain the old process would keep its
 * sockets until the TCP reset (players staring at a frozen board) and hold
 * its ownership leases until the TTL lapses (reconnects replayed to a corpse).
 *
 * The order below is load-bearing, and the invariant is WRITES BEFORE
 * RELEASE: a queue task that passed its lease check is still allowed to save,
 * so the lease must not move until every in-flight task has settled.
 * Releasing first would hand the room to another machine while a stale
 * read-modify-write is still in the air — the exact two-writer clobber the
 * ownership design exists to prevent. Same reason the release is SKIPPED when
 * the settle cap trips: a task that slow is likely wedged on Redis, and a
 * ~TTL reconnect stall beats a corrupted game. Between the socket close and
 * the release, reconnects are refused by the routing layer's drain check and
 * simply retry until the lease moves.
 *
 * 1. Stop starting new work — incoming events go unanswered, so the client's
 *    ack retry finds the new machine instead of a dying one.
 * 2. Note which rooms this machine holds (before their sockets vanish).
 *    A socket still in its join-in-flight window has no `data.gameId` yet —
 *    that room's lease can't be released here and heals by TTL instead.
 * 3. Close all sockets — clients reconnect NOW (the plugin turns the server-
 *    initiated close into an immediate retry) rather than at TCP timeout.
 * 4. Let in-flight queue tasks settle (capped).
 * 5. Release the leases, so the reconnects claim their rooms on a live
 *    machine immediately instead of waiting out the TTL.
 */
export const drainForShutdown = async ({
  io,
  redis,
  settleCapMs = DRAIN_SETTLE_CAP_MS,
}: {
  io: GameServer
  redis: Redis
  settleCapMs?: number
}) => {
  beginDrain()

  const machine = thisMachineId()
  const gameIds = new Set<string>()
  for (const socket of io.of('/').sockets.values()) {
    if (socket.data.gameId) gameIds.add(socket.data.gameId)
  }

  io.disconnectSockets(true)

  const settled = await Promise.race([
    settleGameQueues().then(() => true),
    new Promise<false>(resolve => setTimeout(() => resolve(false), settleCapMs)),
  ])

  if (machine && settled) {
    await Promise.allSettled(
      [...gameIds].map(gameId => releaseGameOwnership(redis, gameId, machine))
    )
  } else if (!settled) {
    console.warn(`Drain settle cap hit — leaving ${gameIds.size} lease(s) to expire by TTL`)
  }

  io.close()
}

export const registerGracefulShutdown = ({ io, redis }: { io: GameServer; redis: Redis }) => {
  if (registered) return
  registered = true

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      console.log(`${signal} received — draining sockets and game tasks before exit`)
      drainForShutdown({ io, redis }).then(
        () => process.exit(0),
        error => {
          console.error('Drain failed — exiting anyway', error)
          process.exit(1)
        }
      )
    })
  }
}
