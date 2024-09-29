import { PLAYER_COLORS } from '../data/palette'
import type { PlayerColor } from '../types/game.types'

export const getRandomPlayerColor = (): PlayerColor => {
  return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]
}
