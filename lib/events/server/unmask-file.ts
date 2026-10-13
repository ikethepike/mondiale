import type { Redis } from '@upstash/redis'
import { isChallengeOfType } from '~~/lib/rounds'
import { unmaskKey, unmaskRungsShown } from '~~/lib/unmask-pace'
import type {
  UnmaskChallenge,
  UnmaskDossier,
  UnmaskFile,
} from '~~/types/challenges/group-modes.type'
import type { Round } from '~~/types/game.types'

/**
 * Unmask's server half that a client harness may also run: reading the sealed
 * file and cutting a seat's dossier from it. Sealing lives in `unmask-seal.ts`.
 */

/** A rung is handed out this far ahead of its moment, so a client clock a
 *  hair fast never asks twice. */
export const UNMASK_RELEASE_LEAD_MS = 250

export const isUnmaskChallenge = (challenge: unknown): challenge is UnmaskChallenge =>
  isChallengeOfType(challenge, 'unmask-challenge')

export const fetchUnmaskFile = async (
  redis: Pick<Redis, 'get'>,
  gameId: string,
  roundIndex: number
): Promise<UnmaskFile | undefined> =>
  (await redis.get<UnmaskFile>(unmaskKey(gameId, roundIndex))) ?? undefined

/** The rungs the round clock has reached at `now`, or every rung and the
 *  answer once `revealed`. Nothing has landed before the window opens. */
export const unmaskDossier = ({
  challenge,
  file,
  round,
  roundIndex,
  now,
  revealed,
}: {
  challenge: UnmaskChallenge
  file: UnmaskFile
  round: Pick<Round, 'playStartsAt'>
  roundIndex: number
  now: number
  revealed: boolean
}): UnmaskDossier => {
  const shown = revealed
    ? challenge.rungs.length
    : round.playStartsAt === undefined || now + UNMASK_RELEASE_LEAD_MS < round.playStartsAt
      ? 0
      : unmaskRungsShown(challenge, now + UNMASK_RELEASE_LEAD_MS - round.playStartsAt)
  return {
    round: roundIndex,
    clues: file.clues.slice(0, shown),
    field: shown ? (file.fields[shown - 1] ?? challenge.suspects) : challenge.suspects,
    ...(revealed ? { reveal: { country: file.country } } : {}),
  }
}
