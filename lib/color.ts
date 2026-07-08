import { PLAYER_COLORS } from '../data/palette'
import type { PlayerColor } from '../types/game.types'

/** A random colour not already taken; falls back to any if the palette is full. */
export const getRandomPlayerColor = (takenColors: string[] = []): PlayerColor => {
  const available = PLAYER_COLORS.filter(color => !takenColors.includes(color))
  const pool = available.length ? available : PLAYER_COLORS
  return pool[Math.floor(Math.random() * pool.length)]
}
