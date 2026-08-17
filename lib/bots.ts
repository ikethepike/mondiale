import type { Game, GameDifficulty } from '~~/types/game.types'
import type { Player } from '~~/types/player.type'
import { sample } from './arrays'
import { clamp01 } from './number'
import { createPlayer } from './player'

/**
 * Bot seat identity — shared by both ends: the server brain plays these
 * seats, the lobby renders their badge, and the join door refuses their ids.
 */

/** Bot ids are self-describing so the join door can refuse them without a
 *  lookup — no socket may ever bind to a bot seat (it has no bearer secret,
 *  and 'claim' would otherwise hand it to the first tab that asked). */
export const BOT_ID_PREFIX = 'bot:'

export const isBotId = (playerId: string): boolean => playerId.startsWith(BOT_ID_PREFIX)

/** A seat the bot brain currently plays: a lobby bot, or a human seat the
 *  AFK autopilot took over. */
export const isBrainSeat = (player: Pick<Player, 'bot' | 'autopilot'>): boolean =>
  !!player.bot || !!player.autopilot

/** Curated roster names — explorers and cartographers, first names only. */
export const BOT_NAMES = [
  'Amelia',
  'Marco',
  'Nellie',
  'Zheng',
  'Freya',
  'Roald',
  'Gertrude',
  'Ida',
  'Isabella',
  'Matthew',
] as const

export const nextBotName = (takenNames: readonly string[]): string => {
  const free = BOT_NAMES.filter(name => !takenNames.includes(name))
  return sample(free.length ? free : BOT_NAMES)!
}

export const createBot = (taken: readonly Pick<Player, 'name' | 'color'>[]): Player => ({
  ...createPlayer(
    `${BOT_ID_PREFIX}${crypto.randomUUID()}`,
    taken.map(seat => seat.color)
  ),
  name: nextBotName(taken.flatMap(seat => seat.name ?? [])),
  ready: true,
  phase: 'waiting-for-game',
  bot: true,
})

/** How much of a round's available score the brain aims for, by difficulty —
 *  the fallback when a seat has no history to mirror. */
export const DIFFICULTY_SHARE: Record<GameDifficulty, number> = {
  easy: 0.35,
  normal: 0.5,
  hard: 0.65,
}

/** Rounds of history that anchor the mirror — enough to smooth one fluke,
 *  short enough to track a player who warms up. */
const SHARE_HISTORY_ROUNDS = 5

/** Hot Cold's coldest trail: strays cost two points each off the attempt
 *  decay, so the wander is bounded rather than scaled without a ceiling. */
export const HOT_COLD_MAX_WANDER = 3

/** Clean Sweep's claim accuracy, floor to ceiling across the share — wide
 *  enough that the three difficulties actually read differently on the board. */
export const SWEEP_ACCURACY: readonly [number, number] = [0.3, 0.95]

/** A gate answer's buzz moment, floor to ceiling across the share. */
export const GATE_REMAINING: readonly [number, number] = [0.45, 0.9]

/**
 * The brain's skill knob for a seat (Isaac's ruling): play at roughly the
 * seat's own demonstrated level — the rolling share of maximum it has been
 * scoring, off the same `playerTurns` every scorecard reads — and fall back
 * to the game difficulty while there is no history (lobby bots' first
 * rounds, an autopilot takeover in round 1).
 *
 * A LOBBY bot floors at its difficulty: the mirror may carry it above the
 * dial on a hot streak, never below, so a cold round can't ratchet a hard
 * table down for the rest of the game. An AUTOPILOT seat keeps the pure
 * mirror — playing at the departed human's demonstrated level IS its spec.
 */
export const botShare = (
  game: Pick<Game, 'rounds' | 'difficulty' | 'players'>,
  playerId: string
): number => {
  const fractions = game.rounds
    .map(round => round.playerTurns[playerId]?.points)
    .filter((points): points is { scored: number; maximum: number } => !!points?.maximum)
    .slice(-SHARE_HISTORY_ROUNDS)
    .map(points => points.scored / points.maximum)
  const dialled = DIFFICULTY_SHARE[game.difficulty]
  if (!fractions.length) return dialled
  const mirrored = clamp01(
    fractions.reduce((sum, fraction) => sum + fraction, 0) / fractions.length
  )
  return game.players?.[playerId]?.bot ? Math.max(dialled, mirrored) : mirrored
}

/** A per-act jitter around the share, so a bot is streaky like a person
 *  rather than metronomic. Clamped off the floor: even a cold seat plays. */
export const jitteredShare = (share: number, random: () => number = Math.random): number =>
  clamp01(share + (random() - 0.5) * 0.3)
