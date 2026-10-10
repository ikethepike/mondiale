import {
  FINAL_QUESTION_CAP_MS,
  INTERSTITIAL_TOTAL_MS,
  SERVER_CONTROLLED_CAPS,
} from '~~/lib/round-beats'
import { sunsetSeconds } from '~~/lib/sunset-window'
import type { FinalChallengeItem } from '~~/types/challenges/final-challenge.type'
import type { GameDifficulty } from '~~/types/game.types'

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

/**
 * When a stage's clock starts: after the gauntlet's opening card on its first
 * question, and after the camera's flight on every timed stage.
 */
export const finalClockStart = (enteredAt: number, firstQuestion: boolean): number =>
  enteredAt + (firstQuestion ? INTERSTITIAL_TOTAL_MS : 0) + FINAL_STAGE_LEAD_MS

/** The question's answer window, stamped when it opens. */
export const finalQuestionDeadline = (
  item: FinalChallengeItem | undefined,
  difficulty: GameDifficulty,
  enteredAt: number,
  firstQuestion: boolean
): number | undefined => {
  const seconds = item ? finalQuestionSeconds(item, difficulty) : undefined
  if (seconds !== undefined) return finalClockStart(enteredAt, firstQuestion) + seconds * 1000
  return SERVER_CONTROLLED_CAPS ? enteredAt + FINAL_QUESTION_CAP_MS : undefined
}
