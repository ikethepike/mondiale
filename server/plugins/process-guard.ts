import { isDraining } from '~~/lib/events/server-side'

/**
 * A restart valve on top of the runtime's existing log-and-continue traps.
 *
 * Nitro's node-server preset already registers `unhandledRejection` /
 * `uncaughtException` handlers that log and keep running (see
 * `trapUnhandledNodeErrors`), and the Nuxt CLI's dev fork has its own
 * restart machinery in the fork's main thread. So one stray reset no longer
 * takes the process down on its own — what neither layer does is give up when
 * the errors stop being one-offs.
 *
 * A storm of uncaught errors (either kind) means the process is wedged, not
 * unlucky — the likeliest cause here is a hard dependency turning sour (Redis
 * auth revoked → every fire-and-forget chain rejects forever), which logs
 * endlessly while rooms stay frozen. Past a threshold, exit non-zero so Fly
 * recycles the machine. The exit deliberately skips the drain (a wedged
 * process can't drain reliably); leases heal by OWNERSHIP_TTL, the same
 * recovery as a crash. Signal handling is untouched: graceful-shutdown.ts
 * stays the only SIGINT/SIGTERM owner.
 *
 * We deliberately DON'T add our own continue-logging handler — that would
 * double every line the runtime trap already prints. We only observe, and
 * only act on the storm. Grep hook (Fly logs are the pager): `error storm`.
 *
 * The threshold is set against a measured floor, not a hunch: a 12-minute
 * 10-room soak with deliberate mid-game socket resets produced ZERO uncaught
 * errors, so any sustained rate is already anomalous. It sits well above the
 * one-off blips this codebase does see, and the valve only ever converts a
 * process that is ALREADY failing into a faster recovery.
 */
const ERROR_STORM_WINDOW_MS = 60_000
const ERROR_STORM_LIMIT = 8

export default defineNitroPlugin(() => {
  let recent: number[] = []

  const note = () => {
    // A deploy drain force-disconnects every socket at once, so a burst of
    // transport errors there is the expected shape of a CLEAN shutdown —
    // exiting on it would abort graceful-shutdown's writes-before-release
    // ordering and strand the very leases the drain exists to hand over.
    if (isDraining()) return

    const now = Date.now()
    recent = recent.filter(at => now - at < ERROR_STORM_WINDOW_MS)
    recent.push(now)
    if (recent.length >= ERROR_STORM_LIMIT) {
      console.error(
        `error storm (${recent.length} uncaught in ${ERROR_STORM_WINDOW_MS}ms) — exiting for restart`
      )
      process.exit(1)
    }
  }

  // Additive to the runtime's own trap listeners — both fire; ours only counts.
  process.on('unhandledRejection', note)
  process.on('uncaughtException', note)
})
