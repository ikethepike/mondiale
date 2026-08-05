import { MEMORY_STALL_WARN_THRESHOLD, memorySnapshot } from '../utils/memory'

/**
 * The 2026-08-04 incident (issue #110) never crashed and never paged anyone:
 * the machine thrashed, every page took 25s, and the only early signal was
 * /proc/pressure/memory climbing. This watch is that signal's pager — a
 * periodic check that warns while the stall is still invisible to players.
 * Fly ships logs; a `memory stall` grep is the alert hook.
 */
const CHECK_INTERVAL_MS = 60_000

export default defineNitroPlugin(() => {
  const timer = setInterval(() => {
    const memory = memorySnapshot()
    if ((memory.stallFullAvg60 ?? 0) >= MEMORY_STALL_WARN_THRESHOLD) {
      console.warn(
        `memory stall: full avg60 ${memory.stallFullAvg60}% ` +
          `(rss ${memory.rssMb}MB, heap ${memory.heapUsedMb}MB) — ` +
          'reclaim is freezing the event loop before players notice'
      )
    }
  }, CHECK_INTERVAL_MS)
  // Never hold an otherwise-idle process open for the watch.
  timer.unref()
})
