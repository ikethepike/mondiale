import type { Redis } from '@upstash/redis'
import { enqueueGameTask } from '../server-side'
import { machineOwnsGame } from './game-ownership'

/**
 * The one timer→queue seam: every delayed server write (engine follow-ups,
 * movement re-entries, reveal pauses) re-enters the per-game queue through
 * here. The seam exists so the sharding guard can never be forgotten — a
 * timer armed on this machine may fire AFTER the game's ownership lease moved
 * (all sockets lapsed, another machine claimed the room), and running it
 * anyway would put two writers on one game: the exact clobber the per-game
 * queue exists to prevent. The guard re-claims a lapsed lease rather than
 * bailing, so an idle-but-still-ours room keeps its rhythm.
 *
 * The timer itself holds no lock and no game state; the task re-derives its
 * own staleness from a fresh fetch, which is what makes arming any follow-up
 * twice always safe. A rejection here (the deploy drain refusing new work)
 * is expected and only logged.
 */
export const scheduleGameTask = (
  { redis, gameId }: { redis: Redis; gameId: string },
  delayMs: number,
  task: () => void | Promise<void>
) => {
  setTimeout(() => {
    enqueueGameTask(gameId, async () => {
      if (!(await machineOwnsGame(redis, gameId))) return
      await task()
    }).catch(error => console.error(`Deferred task failed for ${gameId}`, error))
  }, delayMs)
}
