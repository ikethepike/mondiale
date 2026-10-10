import { seatSubject } from '~~/lib/seat-transitions'
import type { SeatCursor, SeatStep } from '~~/types/seat.types'

/**
 * A fabricated cursor for the dev harness pages, which pose seats in any state
 * without a server. Never used by game code: a real seat only ever moves
 * through `applySeatMove`.
 */
export const mockSeatCursor = (
  step: SeatStep,
  extra: Partial<Omit<SeatCursor, 'step'>> = {}
): SeatCursor => ({
  seq: 1,
  step,
  subject: step === 'walk' ? seatSubject.walk(extra.walk ?? 1, 0) : step,
  enteredAt: Date.now(),
  cause: 'harness',
  walk: 1,
  leg: 0,
  ...extra,
})
