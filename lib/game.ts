import { challengeTiles, GameLength, Tile } from '../types/game'

export const generateGameBoard = (length: GameLength) => {
  const lengths: { [length in GameLength]: number } = {
    long: 90,
    short: 60,
    medium: 80,
  }

  const tiles = lengths[length]

  const board: Tile[] = [...Array(tiles)].map((_, index) => {
    const tile: Tile = {
      players: [],
      type: 'normal',
    }

    if (index === 0) {
      tile.type = 'start'
    }

    if (index && index % 5 === 0) {
      const type = Math.floor(Math.random() * challengeTiles.length)
      tile.type = challengeTiles[type]
    }

    if (index + 1 === tiles) {
      tile.type = 'final'
    }

    return tile
  })

  return board
}
