import { getIndividualChallenge } from '~~/lib/challenges'
import { getFinalChallenges } from '~~/lib/challenges/final-challenge'
import {
  individualChallengeAccessors,
  isValidIndividualChallengeAccessorId,
} from '~~/types/challenges/individual-challenge.type'
import type { Game, PlayerMove } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'

/**
 * The scored points ARE the tiles to walk: the slice starts one past the tile
 * the player stands on and runs `scored` tiles forward, split into one move
 * per challenge gate along the way. Shared by the per-player submit path
 * (submit-group-challenge-answers) and the server-resolved rounds
 * (Border Chain), so the two can never drift.
 */
export const movesForScoredPoints = ({
  game,
  player,
  scored,
}: {
  game: Game
  player: Player
  scored: number
}): PlayerMove[] => {
  const potentialProgress = player.currentPosition + scored
  const potentialTiles = game.tiles.slice(player.currentPosition + 1, potentialProgress + 1)

  // Each move is executed sequentially; challenge moves stop one tile
  // before their gate (see enterMovementPhaseHandler).
  const moves: PlayerMove[] = []
  while (potentialTiles.length) {
    // Identify any special tiles in the moveset
    const specialTileIndex = potentialTiles.findIndex(tile =>
      [...individualChallengeAccessors, 'final'].includes(tile.type)
    )
    const specialTile = potentialTiles[specialTileIndex]

    const spliceCount = specialTileIndex === -1 ? potentialTiles.length : specialTileIndex
    const moveset = potentialTiles.splice(0, spliceCount + 1)
    let move: PlayerMove = {
      endTile: moveset[moveset.length - 1],
    }

    switch (true) {
      // If player has reached final challenge
      case moveset.some(tile => tile.type === 'final'):
        move = {
          endTile: specialTile,
          challenge: getFinalChallenges({ game }),
        }
        break
      // If we have an individual challenge in our moveset
      case isValidIndividualChallengeAccessorId(specialTile?.type):
        {
          const { type: accessorId } = specialTile
          if (!isValidIndividualChallengeAccessorId(accessorId)) {
            throw new EvalError(`Invalid accessor id for challenge: ${accessorId}`)
          }

          move = {
            endTile: specialTile,
            challenge: getIndividualChallenge({
              accessorId,
              difficulty: game.difficulty,
              variant: game.variant,
            }),
          }
        }
        break
    }

    moves.push(move)
  }

  return moves
}
