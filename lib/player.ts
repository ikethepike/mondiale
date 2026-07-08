import type { Player } from '../types/player.type'
import { getRandomPlayerColor } from './color'

/**
 * A fresh player. `takenColors` are the colours already in the game, so a
 * new joiner gets a colour nobody else has (falling back to a random one
 * only if the whole palette is exhausted — an 18-player lobby).
 */
export const createPlayer = (playerId: string, takenColors: string[] = []): Player => ({
  name: '',
  id: playerId,
  ready: false,
  phase: 'naming',
  color: getRandomPlayerColor(takenColors),
  currentPosition: 0,
  moves: [],
  completedAtRound: undefined,
})
