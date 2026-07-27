import type { IndividualChallengeAccessorId } from '~~/types/challenges/individual-challenge.type'
import type { GameLength, Tile } from '~~/types/game.types'
import { weightedPick } from './arrays'

/** Relative deal weights for gate tiles — currency runs at half rate so money
 *  questions surface a little less often than the other themes. */
const GATE_TILE_WEIGHTS: { [id in IndividualChallengeAccessorId]: number } = {
  flag: 1,
  isoCode: 1,
  'capital.name': 1,
  'government.leader': 1,
  currency: 0.5,
  landmarks: 1,
}

const pickGateTileType = (): IndividualChallengeAccessorId =>
  weightedPick(Object.entries(GATE_TILE_WEIGHTS) as [IndividualChallengeAccessorId, number][])!

export const generateTiles = (length: GameLength) => {
  const lengths: { [length in GameLength]: number } = {
    short: 40,
    medium: 80,
    long: 90,
  }

  const count = lengths[length]
  const tiles: Tile[] = [...Array(count)].map((_, index) => {
    const tile: Tile = {
      position: index,
      type: 'normal',
    }

    if (index === 0) {
      tile.type = 'start'
    }

    if (index && index % 5 === 0) {
      tile.type = pickGateTileType()
    }

    if (index + 1 === count) {
      tile.type = 'final'
    }

    return tile
  })

  return tiles
}
