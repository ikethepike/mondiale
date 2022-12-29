import { Player } from '../types/player.type'
import { getRandomPlayerColor } from './color'

export const createPlayer = (playerId: string): Player => ({
  name: '',
  id: playerId,
  ready: false,
  phase: 'naming',
  color: getRandomPlayerColor(),
})
