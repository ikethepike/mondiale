import { finalQuestionDeadline } from '~~/lib/final-timing'
import { gateDeadline } from '~~/lib/gate-timing'
import { FINAL_REVEAL_HOLD_MS, GATE_RESULT_HOLD_MS, REVEAL_HOLD_MS } from '~~/lib/round-beats'
import { seatSubject } from '~~/lib/seat-transitions'
import type { FinalChallengeItem } from '~~/types/challenges/final-challenge.type'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { GameDifficulty } from '~~/types/game.types'
import type { SeatCursor, SeatStep } from '~~/types/seat.types'

const VERDICT_HOLDS: Partial<Record<SeatStep, number>> = {
  'round-verdict': REVEAL_HOLD_MS,
  'gate-verdict': GATE_RESULT_HOLD_MS,
  'final-verdict': FINAL_REVEAL_HOLD_MS,
}

/**
 * A fabricated cursor for the dev harness pages, which pose seats in any state
 * without a server. Never used by game code: a real seat only ever moves
 * through `applySeatMove`. A verdict step gets its beat's hold, so the
 * harness's reveals tick down like the real ones.
 */
export const mockSeatCursor = (
  step: SeatStep,
  extra: Partial<Omit<SeatCursor, 'step'>> = {}
): SeatCursor => {
  const enteredAt = extra.enteredAt ?? Date.now()
  const hold = VERDICT_HOLDS[step]
  return {
    seq: 1,
    step,
    subject: step === 'walk' ? seatSubject.walk(extra.walk ?? 1, 0) : step,
    enteredAt,
    cause: 'harness',
    walk: 1,
    leg: 0,
    ...(hold ? { holdUntil: enteredAt + hold } : {}),
    ...extra,
  }
}

/** A seat landed on a gate, stamped by the server's own gate clock. */
export const mockGateCursor = (
  challenge: Pick<IndividualChallenge, 'variant'>,
  tile: number,
  enteredAt = Date.now()
): SeatCursor =>
  mockSeatCursor('gate', {
    subject: seatSubject.gate(1, tile),
    enteredAt,
    deadline: gateDeadline(challenge, enteredAt),
  })

/** A seat on the gauntlet's first question, stamped by the server's own stage clock. */
export const mockFinalCursor = (
  item: FinalChallengeItem | undefined,
  difficulty: GameDifficulty,
  enteredAt = Date.now()
): SeatCursor =>
  mockSeatCursor('final', {
    subject: seatSubject.final(1, 0),
    enteredAt,
    deadline: finalQuestionDeadline(item, difficulty, enteredAt, true),
  })
