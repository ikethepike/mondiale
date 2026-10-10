import { SEAT_STEP_SPECS, type SeatViewFamily } from '~~/lib/seat-transitions'
import type { SeatCursor, SeatVerdict } from '~~/types/seat.types'

/**
 * Which view a cursor renders, and the identity its component is keyed on.
 * A subject change is a fresh component — nothing question-local survives
 * into the next question — while every beat on the SAME subject (a gate and
 * its verdict, a round and its reveal) stays in one view. The board keeps one
 * identity for the whole walk, and the gauntlet one per run, its questions
 * keyed inside it.
 */
export const seatViewFamily = (cursor: Pick<SeatCursor, 'step'>): SeatViewFamily =>
  SEAT_STEP_SPECS[cursor.step].family

export const seatViewKey = (cursor: Pick<SeatCursor, 'step' | 'subject' | 'walk'>): string => {
  const family = seatViewFamily(cursor)
  switch (family) {
    case 'board':
      return 'board'
    case 'final':
      return `final:w${cursor.walk}`
    case 'round':
    case 'scores':
    case 'gate':
      return `${family}:${cursor.subject}`
    default:
      return family
  }
}

/** The cursor's `kind` verdict, only while the cursor and the verdict are both on `subject`. */
export const seatVerdictOn = <K extends SeatVerdict['kind']>(
  cursor: Pick<SeatCursor, 'subject' | 'verdict'> | undefined,
  kind: K,
  subject: string | undefined = cursor?.subject
): Extract<SeatVerdict, { kind: K }> | undefined => {
  const verdict = cursor?.verdict
  if (verdict?.kind !== kind || verdict.subject !== subject || cursor?.subject !== subject) {
    return undefined
  }
  return verdict as Extract<SeatVerdict, { kind: K }>
}

/** A view's optimistic grade, only while the subject it graded is on screen. */
export const previewOn = <T extends { subject: string }>(
  preview: T | undefined,
  cursor: Pick<SeatCursor, 'subject'> | undefined
): T | undefined => (preview && preview.subject === cursor?.subject ? preview : undefined)
