import { unmaskKey } from '~~/lib/unmask-pace'
import type { UnmaskChallenge } from '~~/types/challenges/group-modes.type'
import type { Game } from '~~/types/game.types'
import { setWithGameTtl } from '../server-side'
import type { EngineContext } from './round-engine'

/** Move the dealt file off the snapshot. Idempotent: a second call finds
 *  nothing sealed and leaves the key the round is already using. */
export const startUnmask = async (
  ctx: Pick<EngineContext, 'redis'>,
  game: Game,
  challenge: UnmaskChallenge
) => {
  if (!challenge.sealed) return
  await setWithGameTtl(ctx.redis, unmaskKey(game.id, game.rounds.length - 1), challenge.sealed)
  delete challenge.sealed
}
