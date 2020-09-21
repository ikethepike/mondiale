import randomWords from 'random-words'
import { generateHash } from './hashing'
import { Game, Player } from '~/types/game'

export const createGame = (playerName: string): Game => {
  const player: Player = {
    id: generateHash(),
    name: playerName,
    points: 0,
  }

  const game: Game = {
    id: randomWords({ exactly: 3, join: '-' }),
    variant: 'world',
    players: [player],
  }

  return game
}
