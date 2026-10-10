import { BOARD_TO_CHALLENGE_HOLD_MS } from '~~/lib/round-beats'
import type { ViewLogEntry } from '~~/lib/playtest-probe'

const isChallengeKey = (key: string) =>
  (key.startsWith('group-') && key !== 'group-scores') ||
  key === 'individual-challenge' ||
  key === 'final-challenge'

export interface ViewLogViolation {
  at: number
  message: string
}

/**
 * The transition grammar a presented-view log must obey. Returns every
 * violation rather than throwing on the first, so a long playtest reports the
 * whole run. `none` (no resolvable view) may only open the session.
 */
export const viewLogViolations = (log: ViewLogEntry[]): ViewLogViolation[] => {
  const violations: ViewLogViolation[] = []
  const flag = (at: number, message: string) => violations.push({ at, message })
  for (const [index, entry] of log.entries()) {
    if (index === 0) continue
    const previous = log[index - 1]!
    if (entry.key === 'none') flag(entry.at, `blank view mid-session at #${index}`)
    if (index >= 2) {
      const before = log[index - 2]!
      if (entry.key === before.key && entry.at - previous.at < 500) {
        flag(entry.at, `view flashed: ${before.key}→${previous.key}→${entry.key}`)
      }
    }
    // The walk protocol on screen: a scorecard only ever closes onto the board.
    if (previous.key === 'group-scores' && entry.key !== 'board' && entry.key !== 'victory') {
      flag(entry.at, `group-scores must hand over to the board, not ${entry.key}`)
    }
    if (isChallengeKey(previous.key) && isChallengeKey(entry.key)) {
      flag(entry.at, `challenge→challenge adjacency: ${previous.key}→${entry.key}`)
    }
    // The arrival beat: a board → gate swap is held so the final hop plays out.
    if (
      previous.key === 'board' &&
      (entry.key === 'individual-challenge' || entry.key === 'final-challenge')
    ) {
      const dwell = entry.at - previous.at
      if (dwell < BOARD_TO_CHALLENGE_HOLD_MS - 250) {
        flag(entry.at, `the board→${entry.key} swap cut the arrival hold (${dwell}ms)`)
      }
    }
  }
  return violations
}
