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

/** A room stops admitting watchers past this — a bound on the "N watching"
 *  count and, more importantly, on the spectator records that ride every
 *  broadcast snapshot. */
export const MAX_SPECTATORS = 20

export type JoinVerdict =
  | { admit: 'seat' }
  | { admit: 'spectate' }
  | {
      admit: 'refuse'
      reason: 'room-full' | 'game-already-started' | 'removed-from-room'
      /** The door is open and a watcher slot is free — the join door leaves
       *  the socket connected so "Watch instead" can just re-emit join. */
      spectatable: boolean
    }

interface JoinDoor {
  players: Partial<Record<string, unknown>>
  spectators?: Partial<Record<string, unknown>>
  started: boolean
  allowSpectators?: boolean
  lobbyKicks?: string[]
}

/**
 * The one admission rule for every join, pre-start and mid-race alike.
 * Membership beats intent: a seated player or admitted watcher always gets
 * back in (refresh and reconnect stay idempotent, watchers bypass the cap),
 * and a kicked id never does. `asSpectator` only matters at a FULL unstarted
 * table — while seats are free a joiner plays, and a STARTED open-door room
 * admits every non-member as a watcher unconditionally (a mid-race joiner
 * has no seat to take; the booth is all there is). `spectatable` folds door
 * AND cap: a full booth refuses terminally just like a sealed door, and the
 * refused visitor must reload to retry. A waiting watcher is never
 * auto-promoted to a freed seat; if a promotion path is ever added it must
 * delete the spectator record when seating, or the watcher count drifts.
 */
export const joinVerdict = (
  game: JoinDoor,
  playerId: string,
  asSpectator = false
): JoinVerdict => {
  if (game.lobbyKicks?.includes(playerId)) {
    return { admit: 'refuse', reason: 'removed-from-room', spectatable: false }
  }
  if (game.players[playerId]) return { admit: 'seat' }
  if (game.spectators?.[playerId]) return { admit: 'spectate' }

  const spectatable =
    !!game.allowSpectators && Object.keys(game.spectators ?? {}).length < MAX_SPECTATORS

  if (game.started) {
    return spectatable
      ? { admit: 'spectate' }
      : { admit: 'refuse', reason: 'game-already-started', spectatable: false }
  }
  if (!tableIsFull(game.players, playerId)) return { admit: 'seat' }
  if (spectatable && asSpectator) return { admit: 'spectate' }
  return { admit: 'refuse', reason: 'room-full', spectatable }
}

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
 * Everyone still competing when a round is dealt takes a seat in it. The one
 * definition of "the table" — turn-based dealers seat their order from it, and
 * the round mix pre-filters kinds against its size (MINIMUM_TABLE_BY_KIND).
 */
export const chainContenders = (game: {
  players: Partial<Record<string, Pick<Player, 'phase'>>>
}): string[] =>
  Object.entries(game.players)
    .filter(([, player]) => !!player && !['kicked', 'victory'].includes(player.phase))
    .map(([playerId]) => playerId)

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
