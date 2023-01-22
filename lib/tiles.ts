import { individualChallengeAccessors } from '~~/types/challenges/individual-challenge.type'
import { GameLength, Tile } from '~~/types/game.types'

export const generateTiles = (length: GameLength) => {
  const lengths: { [length in GameLength]: number } = {
    short: 10,
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
      const type = Math.floor(Math.random() * individualChallengeAccessors.length)
      tile.type = individualChallengeAccessors[type]
    }

    if (index + 1 === count) {
      tile.type = 'final'
    }

    return tile
  })

  return tiles
}
