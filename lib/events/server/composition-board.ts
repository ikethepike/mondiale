import type { Redis } from '@upstash/redis'
import {
  compositionSheetKey,
  forcedPlacement,
  replayPlacements,
  type CompositionBoard,
} from '~~/lib/composition'
import type {
  CompositionBoardView,
  CompositionChallenge,
  CompositionPlacement,
  CompositionSheet,
} from '~~/types/challenges/group-modes.type'
import type { MigrationCorridor } from '~~/generators/vendors/undesa/create-migration'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Composition's server half. The snapshot carries only the group sizes; the
 * answer key is re-derived here from the corridor data, and every seat's
 * attempts live in a side key — so neither the key nor a rival's drops ever
 * ride a broadcast, and a reload resumes from what the server holds.
 */

export const fetchCompositionSheet = async (
  redis: Pick<Redis, 'get'>,
  gameId: string,
  roundIndex: number
): Promise<CompositionSheet> =>
  (await redis.get<CompositionSheet>(compositionSheetKey(gameId, roundIndex))) ?? {}

/** The dealt board with its answer key. Loaded lazily: the corridor matrix
 *  stays off the socket server's static graph. */
export const compositionBoardOf = async (
  challenge: CompositionChallenge
): Promise<{ board: CompositionBoard; origins: MigrationCorridor[] }> => {
  const { compositionOrigins } = await import('~~/lib/migration')
  const origins = compositionOrigins(challenge.country, challenge.shares.length)
  return {
    board: {
      key: origins.map(origin => origin.isoCode),
      shares: challenge.shares,
      strikes: challenge.strikes,
    },
    origins,
  }
}

/**
 * The seat's next attempt, applied when it is the one the seat is on and the
 * board still takes it. Returns the attempts to store, or undefined for a
 * no-op (a retried send, a spent board, a card already standing).
 */
export const applyCompositionDrop = (
  board: CompositionBoard,
  attempts: readonly CompositionPlacement[],
  drop: CompositionPlacement & { attempt: number }
): CompositionPlacement[] | undefined => {
  if (drop.attempt !== attempts.length) return undefined
  if (drop.slot < 0 || drop.slot >= board.key.length) return undefined
  const before = replayPlacements(board, attempts)
  if (before.over || before.placed[drop.slot]) return undefined
  if (Object.values(before.placed).includes(drop.isoCode)) return undefined
  const next = [...attempts, { isoCode: drop.isoCode, slot: drop.slot }]
  const forced = forcedPlacement(board, replayPlacements(board, next))
  return forced ? [...next, forced] : next
}

export const compositionBoardView = ({
  board,
  origins,
  attempts,
  round,
  revealed,
  drop,
}: {
  board: CompositionBoard
  origins: MigrationCorridor[]
  attempts: readonly CompositionPlacement[]
  round: number
  /** The seat can no longer use the key: graded, out of moves, or not seated. */
  revealed: boolean
  drop?: CompositionPlacement
}): CompositionBoardView => {
  const replay = replayPlacements(board, attempts)
  const peopleOf = (isoCode: ISOCountryCode) =>
    origins.find(origin => origin.isoCode === isoCode)?.value.amount
  const fits = drop ? replay.placed[drop.slot] === drop.isoCode : false
  return {
    round,
    attempts: attempts.length,
    placed: replay.placed,
    misses: replay.misses.length,
    over: replay.over,
    ...(drop
      ? { drop: { ...drop, fits, ...(fits ? { people: peopleOf(drop.isoCode) } : {}) } }
      : {}),
    ...(revealed || replay.over
      ? {
          reveal: origins.map(origin => ({
            isoCode: origin.isoCode,
            people: origin.value.amount,
          })),
        }
      : {}),
  }
}
