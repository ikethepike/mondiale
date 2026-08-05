import type { Redis } from '@upstash/redis'
import { beginDrain, settleGameQueues, type GameServer } from '../server-side'
import { releaseGameOwnership, thisMachineId } from './game-ownership'

/** In-flight writes get this long to settle before the exit — must fit inside
 *  fly.toml's kill_timeout with room for the ownership releases. */
const DRAIN_SETTLE_CAP_MS = 3000

let registered = false

/**
 * The deploy drain. A blue-green flip moves traffic to the new machine and
 * then signals this one; without a drain the old process would keep its
 * sockets until the TCP reset (players staring at a frozen board) and hold
 * its ownership leases until the TTL lapses (reconnects replayed to a corpse).
 * So, in order:
 *
 * 1. Stop starting new work — incoming events go unanswered, so the client's
 *    ack retry finds the new machine instead of a dying one.
 * 2. Release every connected room's ownership lease, so reconnects claim the
 *    room on a live machine immediately instead of waiting out the TTL.
 * 3. Close all sockets — clients reconnect NOW (the plugin turns the server-
 *    initiated close into an immediate retry) rather than at TCP timeout.
 * 4. Let in-flight queue tasks settle (capped), then exit.
 */
export const registerGracefulShutdown = ({ io, redis }: { io: GameServer; redis: Redis }) => {
  if (registered) return
  registered = true

  const shutdown = async (signal: string) => {
    console.log(`${signal} received — draining sockets and game tasks before exit`)
    beginDrain()

    const machine = thisMachineId()
    if (machine) {
      const gameIds = new Set<string>()
      for (const socket of io.of('/').sockets.values()) {
        if (socket.data.gameId) gameIds.add(socket.data.gameId)
      }
      await Promise.allSettled(
        [...gameIds].map(gameId => releaseGameOwnership(redis, gameId, machine))
      )
    }

    io.disconnectSockets(true)

    await Promise.race([
      settleGameQueues(),
      new Promise(resolve => setTimeout(resolve, DRAIN_SETTLE_CAP_MS)),
    ])

    io.close()
    process.exit(0)
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      shutdown(signal).catch(error => {
        console.error('Drain failed — exiting anyway', error)
        process.exit(1)
      })
    })
  }
}
