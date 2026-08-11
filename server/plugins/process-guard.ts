/**
 * Log-and-continue backstop: one reset socket (or one bug in a fire-and-forget
 * chain) must never take down every room this process holds. In dev the same
 * escape restarts the whole Nuxt server mid-game ("Restarting Nuxt due to
 * error: read ECONNRESET"), wiping every in-memory timer.
 *
 * A storm of uncaught exceptions means the process is wedged, not unlucky —
 * exit non-zero so Fly restarts it. The exit deliberately skips the drain
 * (a wedged process can't drain reliably); leases heal by OWNERSHIP_TTL, the
 * same recovery as a crash today. Signal handling is untouched:
 * graceful-shutdown.ts stays the only SIGINT/SIGTERM owner.
 *
 * Grep hooks (Fly logs are the pager): `uncaughtException` / `unhandledRejection`.
 * A recurring line here is a bug to fix, not noise to tolerate.
 */
const UNCAUGHT_STORM_WINDOW_MS = 60_000
const UNCAUGHT_STORM_LIMIT = 5

export default defineNitroPlugin(() => {
  let recentUncaught: number[] = []

  process.on('unhandledRejection', reason => {
    console.error('unhandledRejection — continuing', reason)
  })

  process.on('uncaughtException', error => {
    console.error('uncaughtException — continuing', error)
    const now = Date.now()
    recentUncaught = recentUncaught.filter(at => now - at < UNCAUGHT_STORM_WINDOW_MS)
    recentUncaught.push(now)
    if (recentUncaught.length >= UNCAUGHT_STORM_LIMIT) {
      console.error(
        `uncaughtException storm (${recentUncaught.length} in ${UNCAUGHT_STORM_WINDOW_MS}ms) — exiting for restart`
      )
      process.exit(1)
    }
  })
})
