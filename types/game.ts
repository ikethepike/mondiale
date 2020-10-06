import { CountryCode, Country } from './geography'

export type Variant =
  | 'world'
  | 'europe'
  | 'africa'
  | 'north-america'
  | 'south-america'
  | 'asia'

export const variants: Variant[] = [
  'world',
  'europe',
  'africa',
  'north-america',
  'south-america',
  'asia',
]

export interface Round {
  number: number
  points: {
    [playerId: string]: number | undefined
  }
  lists: {
    [playerId: string]: CountryCode[]
  }
}

export interface Game {
  id: string
  host: string
  players: { [playerId: string]: Player }
  variant: Variant
  rounds: Round[]
}

export interface Player {
  id: string
  name?: string
  progress: number
  color: PaletteValues
}

export type Command =
  | { event: 'connect'; gameId: string; playerId: string }
  | { event: 'set-name'; playerId: string; gameId: string; name: string }
  | { event: 'start-game'; playerId: string; gameId: string }
  | { event: 'submit-order'; playerId: string; gameId: string }
  | { event: 'join-game'; playerId: string; gameId: string }
  | { event: 'wave-at-player'; playerId: string; gameId: string }

export type Update =
  | { event: 'name-set'; game: Game }
  | {
      event: 'new-round'
      stat: Stat
      lists: {
        [playerId: string]: CountryCode[]
      }
    }
  | { event: 'player-joined'; game: Game }
  | { event: 'player-waved' }

export type Stat =
  | keyof Country['health']
  | Country['economics']
  | Country['geography']
export interface Turn {
  number: number
  player: Player
}

export type PaletteValues =
  | '#0d2f61'
  | '#3481a1'
  | '#90bcb5'
  | '#f1b982'
  | '#ec6247'

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

export const stats: Stat[] = ['obesity']
