import { useClientEvents } from '~~/lib/events/client-side'

// Module-level so every caller (board pacing, ModalMoving's safety net) shares
// one in-flight request and one retry chain.
let inFlight = false
let retryTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Consume `pendingMovementRequest` by delivering 'enter-movement-phase' with
 * server confirmation. The flag is cleared only once the server acks; a failed
 * send keeps it set and self-retries. Deliberately not owned by the 3D board:
 * the board is a lazy chunk whose load can fail outright (stale post-deploy
 * URL, offline gap), and the round must advance regardless.
 */
export const useMovementRequest = () => {
  const { gameStore, update } = useClientEvents()

  const requestMovementIfPending = async (): Promise<void> => {
    if (!gameStore.pendingMovementRequest || inFlight) return
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = undefined
    }

    inFlight = true
    try {
      const delivered = await update({ event: 'enter-movement-phase' })
      if (delivered) {
        gameStore.pendingMovementRequest = false
      } else {
        // Self-rescheduling keeps the request alive even if every component
        // that could re-trigger it has unmounted; it no-ops once consumed.
        retryTimer = setTimeout(requestMovementIfPending, 3000)
      }
    } finally {
      inFlight = false
    }
  }

  return { requestMovementIfPending }
}
