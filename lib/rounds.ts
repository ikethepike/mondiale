import { isGroupChallenge, type RoundChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { GroupChallengeAccessorId } from '~~/types/challenges/group-challenge.type'
import type { Game, Round } from '~~/types/game.types'

/** Every round challenge that carries a `_type` discriminant. The legacy
 *  ranking `GroupChallenge` has none, so `Extract` drops it automatically. */
export type TypedRoundChallenge = Extract<RoundChallenge, { _type: string }>

/**
 * Round accessors and `_type` narrowing, in one place. Every mode engine,
 * handler and store used to re-derive "the live round" and hand-roll its own
 * `_type === '…'` guard — these four are the only spellings allowed.
 */

/** The round in play (the last dealt one), if any. */
export const latestRound = (game: Pick<Game, 'rounds'>): Round | undefined =>
  game.rounds[game.rounds.length - 1]

/** Guard: is this the round-challenge kind the caller runs? */
export const isChallengeOfType = <T extends TypedRoundChallenge['_type']>(
  challenge: unknown,
  typeName: T
): challenge is Extract<TypedRoundChallenge, { _type: T }> =>
  !!challenge &&
  typeof challenge === 'object' &&
  '_type' in challenge &&
  challenge._type === typeName

/** The live round's challenge, narrowed — undefined when the live round is
 *  a different mode. What every turn engine's `current*` accessor was. */
export const latestChallengeOfType = <T extends TypedRoundChallenge['_type']>(
  game: Pick<Game, 'rounds'>,
  typeName: T
): Extract<TypedRoundChallenge, { _type: T }> | undefined => {
  const challenge = latestRound(game)?.groupChallenge
  return isChallengeOfType(challenge, typeName) ? challenge : undefined
}

/** The stat a ranking round measures — undefined for every other mode. */
export const rankingAccessorId = (
  challenge: RoundChallenge | undefined
): GroupChallengeAccessorId | undefined => (isGroupChallenge(challenge) ? challenge.id : undefined)

/** Narrow or throw — the answers handler's per-kind guard. */
export const expectChallengeType = <T extends TypedRoundChallenge['_type']>(
  challenge: RoundChallenge | undefined,
  typeName: T
): Extract<TypedRoundChallenge, { _type: T }> => {
  if (!isChallengeOfType(challenge, typeName)) throw new TypeError('kind mismatch')
  return challenge
}
