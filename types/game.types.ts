import { PLAYER_COLORS } from '~~/data/palette'
import { FinalChallenge } from './challenges/final-challenge.type'
import { GroupChallenge } from './challenges/group-challenge.type'
import {
  IndividualChallenge,
  IndividualChallengeAccessorId,
} from './challenges/individual-challenge.type'
import { ISOCountryCode } from './geography.types'
import { Player } from './player.type'

export interface Game {
  id: string
  host: string
  tiles: Tile[]
  rounds: Round[]
  started: boolean
  length: GameLength
  variant: GameVariant
  difficulty: GameDifficulty
  players: { [playerId: string]: Player }
  position: { [playerID: string]: PlayerPosition }
}

export const gameDifficulties = ['easy', 'normal', 'hard'] as const
export type GameDifficulty = typeof gameDifficulties[number]

export interface PlayerPosition {
  currentPosition: number
  moves: PlayerMove[]
  progress: PlayerProgress[]
}

export interface PlayerProgress {
  round: number
  endTilePosition: number
}

export interface PlayerMove {
  endTile: Tile
  steps: number
  challenge?: IndividualChallenge | FinalChallenge
}

export interface PlayerTurn {
  points: {
    scored: number
    maximum: number
  }
}

export interface Round {
  groupChallenge: GroupChallenge
  groupAnswers: { [playerId: string]: GroupChallengeAnswer } // Answers to the group challenge
  playerTurns: {
    [playerId: string]: PlayerTurn
  }
}

export interface GroupChallengeAnswer {
  submitted: ISOCountryCode[]
  correct: ISOCountryCode[]
}

export const gameVariants = [
  'world',
  'europe',
  'africa',
  'north-america',
  'south-america',
  'asia',
] as const
export type GameVariant = typeof gameVariants[number]
export const isValidGameVariant = (variant: any): variant is GameVariant => {
  return variant && gameVariants.includes(variant)
}

export interface GameConfiguration {
  difficulty: GameDifficulty
  variant: GameVariant
  length: GameLength
}

export const isValidGameConfiguration = (data: any): data is GameConfiguration => {
  if (!data) return false
  if (typeof data !== 'object') return false
  if (![`difficulty`, 'length', 'variant'].every(key => Reflect.has(data, key))) return false
  if (!isValidGameVariant(data.variant)) return false

  return true
}

export const gameLengths = ['short', 'medium', 'long'] as const
export type GameLength = typeof gameLengths[number]

export interface Tile {
  position: number
  type: 'normal' | 'final' | 'start' | IndividualChallengeAccessorId
}

export type PaletteValues = '#0d2f61' | '#3481a1' | '#90bcb5' | '#f1b982' | '#ec6247'

export const palette: {
  darkBlue: PaletteValues
  softBlue: PaletteValues
  softMint: PaletteValues
  warmSand: PaletteValues
  hiorAnge: PaletteValues
} = {
  darkBlue: '#0d2f61',
  softBlue: '#3481a1',
  softMint: '#90bcb5',
  warmSand: '#f1b982',
  hiorAnge: '#ec6247',
}

export type PlayerColor = typeof PLAYER_COLORS[number]

export const isValidGame = (data: any): data is Game => {
  if (!data) return false
  if (typeof data !== 'object') return false

  return ['id', 'host', 'tiles', 'rounds', 'variant', 'players'].every(key =>
    Reflect.has(data, key)
  )
}
