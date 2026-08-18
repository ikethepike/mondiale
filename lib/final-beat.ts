import type { FinalBeatEntry } from '~~/store/game.store'
import { FINAL_BEAT_TTL_MS } from './round-beats'

/**
 * Reading the gauntlet's verdict beat — THE one place both readers agree.
 *
 * The answering player grades locally the instant they tap (zero-latency
 * feedback is the whole feel of the mode) and the beat merely confirms it.
 * Everyone else — a watcher in the booth, a seat parked on the board — has
 * only the beat, because the snapshot deliberately holds pre-answer lives
 * through the reveal. Both paths run through the helpers here so the two can
 * never narrate the same question differently.
 */

/**
 * The live beat for a seat: theirs, still inside its window, and about the
 * question whose reveal is on screen.
 *
 * The turn guard is subtler than equality. A beat names the turn it RESOLVED
 * (the pre-bump value), while the gauntlet on the snapshot has already
 * advanced — so during the reveal hold the live turn is the beat's plus one.
 * Equality would therefore discard every beat. What must be rejected is a
 * beat from further back than that: the view clears its verdict when the
 * challenge changes, and an older beat would relight the reveal on a question
 * it never described.
 *
 * A miss that redeals keeps the same queue position but still bumps the turn,
 * so the same rule holds for both outcomes.
 */
export const latestBeatFor = (
  beats: readonly FinalBeatEntry[],
  seatId: string | undefined,
  options: { turn?: number; now?: number } = {}
): FinalBeatEntry | undefined => {
  if (!seatId) return undefined
  const now = options.now ?? Date.now()
  const liveTurn = options.turn
  return beats
    .filter(beat => beat.playerId === seatId && beat.at > now - FINAL_BEAT_TTL_MS)
    .filter(beat => liveTurn === undefined || beat.turn >= liveTurn - 1)
    .reduce<FinalBeatEntry | undefined>(
      (newest, beat) => (!newest || beat.at >= newest.at ? beat : newest),
      undefined
    )
}

/** The verdict a beat carries, in the shape the map status and every reveal
 *  gate already speak. */
export const beatStatus = (beat?: FinalBeatEntry): 'correct' | 'incorrect' | undefined => {
  if (!beat) return undefined
  return beat.correct ? 'correct' : 'incorrect'
}

/**
 * What the hearts show.
 *
 * The wire holds pre-answer lives through the whole reveal beat. The player
 * covers that by spending the heart optimistically off their own local
 * verdict; a watcher has no local verdict, which is why their hearts used to
 * arrive eight seconds late. A beat carries the POST-verdict count, so when
 * one is live it is simply the truth — no optimism needed.
 */
export const beatDisplayedLives = ({
  beat,
  status,
  livesRemaining,
  knockedOut,
}: {
  beat?: FinalBeatEntry
  status?: 'correct' | 'incorrect'
  livesRemaining: number
  knockedOut: boolean
}): number => {
  if (knockedOut || beat?.knockedOut) return 0
  if (beat) return Math.max(0, beat.lives)
  // No beat (an older client, a dropped fire-and-forget frame): fall back to
  // the optimistic spend, which is what shipped before and still reads right
  // for the player who just answered.
  if (status === 'incorrect') return Math.max(0, livesRemaining - 1)
  return livesRemaining
}

/** The country a beat's answer names, where its mode has a single pick — the
 *  reveal cards' `picked`. Multi-pick modes (sunset sweeps, nocturne cities,
 *  a traced boundary) have no single subject and fall through. */
export const beatPickedCountry = (beat?: FinalBeatEntry): string | undefined => {
  const answer = beat?.submittedAnswer
  if (!answer) return undefined
  return 'isoCode' in answer ? answer.isoCode : undefined
}
