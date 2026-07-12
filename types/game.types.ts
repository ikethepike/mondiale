import type { PLAYER_COLORS } from '~~/data/palette'
import type { LatLng } from '~~/lib/geo'
import {
  isValidChallengeOverrides,
  type ChallengeOverrides,
} from './challenges/challenge-groups.type'
import type { FinalChallenge } from './challenges/final-challenge.type'
import type {
  IndividualChallenge,
  IndividualChallengeAccessorId,
} from './challenges/individual-challenge.type'
import type { RoundChallenge } from './challenges/traversal-challenge.type'
import type { ISOCountryCode } from './geography.types'
import type { Player } from './player.type'

export interface Game {
  id: string
  host: string
  tiles: Tile[]
  rounds: Round[]
  started: boolean
  length: GameLength
  variant: GameVariant
  difficulty: GameDifficulty
  /** Show opponents' guesses as they land. Absent on games created before the
   *  setting existed, so read it as `!== false` — never as truthy. */
  liveGuesses?: boolean
  /** Host's per-group tri-state: absent key = auto (follow difficulty),
   *  true = force-enabled below its gate, false = off at any difficulty. */
  challengeOverrides?: ChallengeOverrides
  players: { [playerId: string]: Player }
  /** Set while a new round has been staged (pushed to `rounds`) but its settle
   *  pause hasn't elapsed yet. Guards the staging + reveal so each fires once
   *  even though the movement handler re-enters itself across the pause. */
  pendingRoundStart?: boolean
}

export const gameDifficulties = ['easy', 'normal', 'hard'] as const
export type GameDifficulty = (typeof gameDifficulties)[number]

export interface PlayerMove {
  endTile: Tile
  challenge?: IndividualChallenge | FinalChallenge
}

export interface PlayerTurn {
  points: {
    scored: number
    maximum: number
  }
}

export interface Round {
  groupChallenge: RoundChallenge
  groupAnswers: { [playerId: string]: GroupChallengeAnswer } // Answers to the group challenge
  playerTurns: {
    [playerId: string]: PlayerTurn
  }
}

export interface GroupChallengeAnswer {
  submitted: ISOCountryCode[]
  correct: ISOCountryCode[]
  /** Sketch rounds: the player's normalized drawing, for the reveal overlay. */
  sketch?: [number, number][]
  /** Pin-landmark rounds: where the player pinned, and by how far they missed.
   *  Both exist for the reveal — the score is already settled by then. */
  pin?: LatLng
  distanceKm?: number
}

export const gameVariants = [
  'world',
  'europe',
  'africa',
  'north-america',
  'south-america',
  'asia',
] as const
export type GameVariant = (typeof gameVariants)[number]
export const isValidGameVariant = (variant: unknown): variant is GameVariant => {
  return typeof variant === 'string' && gameVariants.includes(variant as GameVariant)
}

export interface GameConfiguration {
  difficulty: GameDifficulty
  variant: GameVariant
  length: GameLength
  liveGuesses: boolean
  challengeOverrides: ChallengeOverrides
}

export const isValidGameConfiguration = (data: unknown): data is GameConfiguration => {
  if (!data) return false
  if (typeof data !== 'object') return false
  const configuration = data as GameConfiguration
  // Values, not just key presence — game.difficulty indexes
  // DIFFICULTY_CONFIGURATION and drives every challenge gate, so an unknown
  // difficulty from a crafted payload would crash the dealer server-side.
  if (!isValidGameVariant(configuration.variant)) return false
  if (!gameDifficulties.includes(configuration.difficulty)) return false
  if (!gameLengths.includes(configuration.length)) return false
  // FormData hands every field over as a string; the form must coerce first.
  if (typeof configuration.liveGuesses !== 'boolean') return false

  return isValidChallengeOverrides(configuration.challengeOverrides)
}

export const gameLengths = ['short', 'medium', 'long'] as const
export type GameLength = (typeof gameLengths)[number]

export interface Tile {
  position: number
  type: 'normal' | 'final' | 'start' | IndividualChallengeAccessorId
}

export type PlayerColor = (typeof PLAYER_COLORS)[number]

export const isValidGame = (data: unknown): data is Game => {
  if (!data) return false
  if (typeof data !== 'object') return false

  return ['id', 'host', 'tiles', 'rounds', 'variant', 'players'].every(key =>
    Reflect.has(data, key)
  )
}
