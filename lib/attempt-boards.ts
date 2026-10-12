import type { RoundChallenge } from '~~/types/challenges/traversal-challenge.type'
import { isChallengeOfType } from './rounds'

/** The option boards priced by attempt: their options, and how many picks a
 *  seat may spend on them. Undefined for any other round, or a free-typed one. */
export const attemptBoardOf = (
  challenge: RoundChallenge | undefined
): { options: readonly string[]; maximumGuesses: number } | undefined => {
  const board =
    isChallengeOfType(challenge, 'capital-guess-challenge') ||
    isChallengeOfType(challenge, 'flashpoint-challenge') ||
    isChallengeOfType(challenge, 'ground-plan-challenge') ||
    isChallengeOfType(challenge, 'pyramid-scheme-challenge')
      ? challenge
      : undefined
  return board?.options && board.maximumGuesses
    ? { options: board.options, maximumGuesses: board.maximumGuesses }
    : undefined
}

/** The pick sequence an option board is priced on: the picks the seat's
 *  record already holds (`spend-pick`), then the submitted ones it lacks. */
export const attemptSequence = <Pick extends string>(
  spent: readonly string[] | undefined,
  picks: readonly Pick[]
): Pick[] => {
  const recorded = (spent ?? []) as Pick[]
  return [...recorded, ...picks.filter(pick => !recorded.includes(pick))]
}
