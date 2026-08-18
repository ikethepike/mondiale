import type { ClientSideEventHandler } from '~~/lib/events/client-registry'
import { FINAL_BEAT_TTL_MS } from '~~/lib/round-beats'

/** Bounds the list between prune ticks, so a burst can't grow the scene. */
const MAX_ENTRIES = 4

/**
 * A gauntlet question resolved — append it to the ephemeral beat list the
 * final-challenge view and the booth read. Same self-expiring posture as
 * table notices and cheers.
 *
 * The beat is what a WATCHER grades by: the snapshot holds pre-answer lives
 * through the reveal hold, so without this nobody but the answering player
 * learns the verdict until the next question lands.
 */
export const finalBeatEvent: ClientSideEventHandler = ({ payload, gameStore }) => {
  if (payload.event !== 'final-beat') return
  // The TTL compares against THIS clock, but `at` was stamped by the server's
  // — on a device running fast the beat would expire on arrival, on a slow one
  // it would overstay. Arrival time is the one stamp that gives the full
  // display window on every clock. (Same lesson as table-notice.)
  const at = Date.now()
  const next = [
    // Idempotent on the seat's turn: a redelivered beat replaces rather than
    // stacks, so a retry can't show the same verdict twice.
    ...gameStore.board.finalBeats.filter(
      beat => beat.entryId !== payload.entryId && beat.at > at - FINAL_BEAT_TTL_MS
    ),
    {
      entryId: payload.entryId,
      playerId: payload.playerId,
      turn: payload.turn,
      correct: payload.correct,
      timedOut: payload.timedOut,
      challenge: payload.challenge,
      submittedAnswer: payload.submittedAnswer,
      lives: payload.lives,
      answeredCorrect: payload.answeredCorrect,
      totalCount: payload.totalCount,
      knockedOut: payload.knockedOut,
      at,
    },
  ]
  gameStore.board.finalBeats = next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
}
