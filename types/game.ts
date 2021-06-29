import { CountryCode, Country } from './geography'

export type Variant = 'world' | 'europe' | 'africa' | 'north-america' | 'south-america' | 'asia'

export const variants: Variant[] = [
  'world',
  'europe',
  'africa',
  'north-america',
  'south-america',
  'asia',
]

export const challengeTiles = ['challenge-country', 'challenge-capital'] as const

export interface Tile {
  type: 'normal' | 'final' | 'start' | typeof challengeTiles[number]
  players: string[]
}

export interface Game {
  id: string
  host: string
  tiles: Tile[]
  rounds: Round[]
  variant: Variant
  options: GameOptions
  players: { [playerId: string]: Player }
}

export interface Player {
  id: string
  name?: string
  progress: number
  color: GameColor
}

export type Command =
  | {
      event: 'connect'
      gameId: string
      playerId: string
      variant?: Variant
      options?: GameOptions
    }
  | {
      event: 'set-player'
      playerId: string
      gameId: string
      name: string
    }
  | {
      event: 'set-color'
      color: GameColor
      playerId: string
      gameId: string
    }
  | { event: 'start-game'; playerId: string; gameId: string }
  | { event: 'submit-order'; playerId: string; gameId: string }
  | { event: 'join-game'; playerId: string; gameId: string }
  | {
      event: 'wave-at-player'
      playerId: string
      gameId: string
      targetPlayer: string
    }
  | {
      event: 'kick-player'
      playerId: string
      gameId: string
      targetPlayer: string
    }
  | {
      gameId: string
      playerId: string
      order: CountryCode[]
      event: 'submit-country-order'
    }

export type Update =
  | { event: 'name-set'; game: Game }
  | { event: 'color-set'; game: Game }
  | { event: 'new-round'; game: Game }
  | { event: 'player-joined'; game: Game }
  | { event: 'player-waved'; playerId: string }
  | { event: 'player-kicked' }
  | { event: 'game-updated'; game: Game }

export type Stat = keyof Country['health'] | Country['economics'] | Country['geography']

export interface Turn {
  number: number
  player: Player
}

export interface GameOptions {
  treaties: boolean
  gender: boolean
  leaders: boolean
  easyMode: boolean
  length: GameLength
}

export type GameLength = 'short' | 'medium' | 'long'

export const gameColors = [
  '#1C3144',
  '#D00000',
  '#FFBA08',
  '#A2AEBB',
  '#3F88C5',
  '#6FD08C',
  '#7B9EA8',
  '#E09891',
  '#CB769E',
  '#EFBDEB',
  '#2A9D8F',
  '#06D6A0',
  '#FCFCFC',
  '#98D2EB',
  '#75B9BE',
  '#87BCDE',
  '#63A088',
  '#FFC4D1',
] as const

export type GameColor = typeof gameColors[number]

export type PaletteValue = '#0d2f61' | '#3481a1' | '#90bcb5' | '#f1b982' | '#ec6247'

export const palette: {
  darkBlue: PaletteValue
  softBlue: PaletteValue
  softMint: PaletteValue
  warmSand: PaletteValue
  hiorAnge: PaletteValue
} = {
  darkBlue: '#0d2f61',
  softBlue: '#3481a1',
  softMint: '#90bcb5',
  warmSand: '#f1b982',
  hiorAnge: '#ec6247',
}

export const stats: Stat[] = ['obesity']

export interface Challenge {
  points?: number
  answers?: CountryCode[]
  countries: CountryCode[]
}
export interface Round {
  question: string
  statistic: string
  challenges: {
    [playerId: string]: Challenge
  }
}
