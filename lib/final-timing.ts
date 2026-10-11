import {
  FINAL_QUESTION_CAP_MS,
  INTERSTITIAL_TOTAL_MS,
  SERVER_CONTROLLED_CAPS,
} from '~~/lib/round-beats'
import { sunsetSeconds } from '~~/lib/sunset-pace'
import type { FinalChallenge, FinalChallengeItem } from '~~/types/challenges/final-challenge.type'
import type { GameDifficulty } from '~~/types/game.types'
import type { SeatCursor } from '~~/types/seat.types'

/** The camera's flight onto a map stage before its clock starts running. */
export const FINAL_STAGE_LEAD_MS = 1500

/** A gauntlet stage's own clock in seconds, or undefined for an untimed question. */
export const finalQuestionSeconds = (
  item: FinalChallengeItem,
  difficulty: GameDifficulty
): number | undefined => {
  switch (item._type) {
    case 'city-nocturne-challenge':
      return item.durationSeconds
    case 'yearbook-challenge':
      return item.headlines.length * item.secondsPerHeadline
    case 'sunset-blitz-challenge':
      return sunsetSeconds(item.countries.length, difficulty)
    default:
      return undefined
  }
}

/** A timed stage's deadline when its question is released at `releasedAt` —
 *  the opening card over — or undefined for an untimed question. */
export const finalClockDeadline = (
  item: FinalChallengeItem | undefined,
  difficulty: GameDifficulty,
  releasedAt: number
): number | undefined => {
  const seconds = item ? finalQuestionSeconds(item, difficulty) : undefined
  return seconds === undefined ? undefined : releasedAt + FINAL_STAGE_LEAD_MS + seconds * 1000
}

/**
 * The question's answer window, stamped when it opens. The first question
 * waits out the gauntlet's full opening card — a seat that dismisses it sooner
 * releases the clock early through `round-play`.
 */
export const finalQuestionDeadline = (
  item: FinalChallengeItem | undefined,
  difficulty: GameDifficulty,
  enteredAt: number,
  firstQuestion: boolean
): number | undefined =>
  finalClockDeadline(item, difficulty, enteredAt + (firstQuestion ? INTERSTITIAL_TOTAL_MS : 0)) ??
  (SERVER_CONTROLLED_CAPS ? enteredAt + FINAL_QUESTION_CAP_MS : undefined)

/** When the gauntlet's opening card is spent: the release its stage clock was
 *  stamped from on a timed question, the full card on an untimed one. */
export const finalInterstitialEndsAt = (
  item: FinalChallengeItem | undefined,
  difficulty: GameDifficulty,
  cursor: Pick<SeatCursor, 'enteredAt' | 'deadline'>
): number => {
  const seconds = item ? finalQuestionSeconds(item, difficulty) : undefined
  if (seconds === undefined || cursor.deadline === undefined) {
    return cursor.enteredAt + INTERSTITIAL_TOTAL_MS
  }
  return cursor.deadline - seconds * 1000 - FINAL_STAGE_LEAD_MS
}

/** The question's place in the run, 1-based: a replacement dealt for a missed
 *  last question re-asks that place, and the verdict's hold keeps its turn. */
export const finalQuestionNumber = (gauntlet: Pick<FinalChallenge, 'turn' | 'totalCount'>) =>
  Math.min(gauntlet.totalCount, (gauntlet.turn ?? 0) + 1)
