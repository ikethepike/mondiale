import type { Player } from '../types/player.type'
import { getRandomPlayerColor } from './color'

export const MAX_PLAYER_NAME_LENGTH = 24

/**
 * The table size the game is tuned for. Turn-based rounds grow a full
 * turn+reveal per seat (Timeline's deck is `cardsPerPlayer × players`),
 * whole-table barriers wait on every seat, and each player record rides
 * every broadcast snapshot — so the cap is a gameplay rule, not a UI nicety.
 * Enforced at the join door; the lobby counter reads the same constant.
 */
export const MAX_PLAYERS = 8

/**
 * The join door's seat check: a newcomer is refused once the table is at
 * capacity, while returning players (already seated) always get back in —
 * rejoins stay idempotent, exactly like the spectator door.
 */
export const tableIsFull = (
  players: Partial<Record<string, unknown>>,
  playerId: string
): boolean => !players[playerId] && Object.keys(players).length >= MAX_PLAYERS

/**
 * The one gate a submitted player name passes through (client guard and
 * server handler alike): trims whitespace and clamps the length, returning
 * undefined when nothing readable remains — blank names never enter a game.
 */
export const normalizePlayerName = (name: unknown): string | undefined => {
  if (typeof name !== 'string') return undefined
  const trimmed = name.trim().slice(0, MAX_PLAYER_NAME_LENGTH).trim()
  return trimmed || undefined
}

/**
 * A fresh player. `takenColors` are the colours already in the game, so a
 * new joiner gets a colour nobody else has (the exhausted-palette fallback
 * is unreachable under MAX_PLAYERS, kept as a safety net).
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

/**
 * The one display-name fallback. Every surface that prints a player name
 * routes through here so an unnamed player reads the same everywhere.
 */
export const playerDisplayName = (player?: Pick<Player, 'name'>): string =>
  player?.name || 'Anonymous'

/**
 * "You" for the viewer, the display name for everyone else — the seat label
 * every turn-based mode and reveal card prints.
 */
export const seatLabel = (
  players: Partial<Record<string, Pick<Player, 'name'>>> | undefined,
  playerId: string,
  viewerId?: string
): string => (playerId === viewerId ? 'You' : playerDisplayName(players?.[playerId]))

/**
 * How far along the board a pawn is, as a 0..1 fraction of the last tile.
 * The one formula — progress bars must not re-derive it (they had drifted
 * between `/ length` and `/ (length - 1)`).
 */
export const boardProgress = (position: number, tileCount: number): number => {
  const span = Math.max(1, tileCount - 1)
  return Math.min(1, Math.max(0, position / span))
}

/**
 * Standings order: finished players first (earliest completion round wins),
 * everyone else by how far along the board they are.
 */
export const compareStandings = (a: Player, b: Player): number => {
  const aFinished = a.completedAtRound ?? Infinity
  const bFinished = b.completedAtRound ?? Infinity
  if (aFinished !== bFinished) return aFinished - bFinished
  return b.currentPosition - a.currentPosition
}
