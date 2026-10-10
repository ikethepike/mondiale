import { getIndividualChallenge, getRoundChallenge } from '~~/lib/challenges'
import {
  individualChallengeAccessors,
  isValidIndividualChallengeAccessorId,
} from '~~/types/challenges/individual-challenge.type'
import type { FinalChallengeItem } from '~~/types/challenges/final-challenge.type'
import type { RoundChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { Game, PlayerMove, Tile } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { drawLabel, recordedDrawAsync } from './draws'

/** THE moveset deal: every scored seat's walk is dealt (and recorded) here. */
export const dealMoves = (args: {
  game: Game
  player: Player
  scored: number
  /** A fixed moveset (the FORCE_FINAL_CHALLENGE hook) — still recorded. */
  moves?: PlayerMove[]
}): Promise<PlayerMove[]> =>
  recordedDrawAsync(args.game, drawLabel.moves(args.player.id), async () =>
    args.moves ? args.moves : movesForScoredPoints(args)
  )

/** A missed LAST gauntlet question is replaced, never skipped. Null: nothing left to deal. */
export const dealFinalReplacement = (
  game: Game,
  exclude: FinalChallengeItem['_type'][]
): Promise<FinalChallengeItem | null> =>
  recordedDrawAsync(game, drawLabel.finalReplacement(), async () => {
    // Deferred module: final-challenge carries ~1.2MB of endgame data (#110).
    const { dealReplacementChallenge } = await import('~~/lib/challenges/final-challenge')
    return dealReplacementChallenge({ game, exclude }) ?? null
  })

/** THE round deal, at the reveal. */
export const dealRound = (game: Game): Promise<RoundChallenge> =>
  recordedDrawAsync(game, drawLabel.round(), () => getRoundChallenge({ game }))

/** A tile a walk must stop short of: a gate, or the final gauntlet. */
export const isChallengeTile = (tile: Tile): boolean =>
  [...individualChallengeAccessors, 'final'].includes(tile.type)

/**
 * The scored points ARE the tiles to walk: the slice starts one past the tile
 * the player stands on and runs `scored` tiles forward, split into one move
 * per challenge gate along the way.
 */
export const movesForScoredPoints = async ({
  game,
  player,
  scored,
}: {
  game: Game
  player: Player
  scored: number
}): Promise<PlayerMove[]> => {
  const potentialProgress = player.currentPosition + scored
  const potentialTiles = game.tiles.slice(player.currentPosition + 1, potentialProgress + 1)

  // Each move is executed sequentially; challenge moves stop one tile
  // before their gate (see `gateStopTile`).
  const moves: PlayerMove[] = []
  while (potentialTiles.length) {
    // Identify any special tiles in the moveset
    const specialTileIndex = potentialTiles.findIndex(isChallengeTile)
    const specialTile = potentialTiles[specialTileIndex]

    const spliceCount = specialTileIndex === -1 ? potentialTiles.length : specialTileIndex
    const moveset = potentialTiles.splice(0, spliceCount + 1)
    let move: PlayerMove = {
      endTile: moveset[moveset.length - 1],
    }

    switch (true) {
      // If player has reached final challenge
      case moveset.some(tile => tile.type === 'final'): {
        // Deferred module: final-challenge carries ~1.2MB of endgame data
        // (events, treaties, changes, exporters, map) that the server only
        // needs once a game actually reaches the gauntlet (issue #110).
        const { getFinalChallenges } = await import('~~/lib/challenges/final-challenge')
        move = {
          endTile: specialTile,
          challenge: getFinalChallenges({ game }),
        }
        break
      }
      // If we have an individual challenge in our moveset
      case isValidIndividualChallengeAccessorId(specialTile?.type):
        {
          const { type: accessorId } = specialTile
          if (!isValidIndividualChallengeAccessorId(accessorId)) {
            throw new EvalError(`Invalid accessor id for challenge: ${accessorId}`)
          }

          move = {
            endTile: specialTile,
            challenge: await getIndividualChallenge({
              accessorId,
              difficulty: game.difficulty,
              variant: game.variant,
              includeMicroNations: game.includeMicroNations,
              challengeOverrides: game.challengeOverrides,
            }),
          }
        }
        break
    }

    moves.push(move)
  }

  return moves
}
