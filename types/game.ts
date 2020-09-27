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

export interface Game {
  id: string
  players: { [key: string]: Player }
  variant: Variant
}

export interface Player {
  id: string
  name?: string
  progress: number
  color: PaletteValues
}

export type Command =
  | { event: 'connect'; gameId: string; playerId?: string }
  | { event: 'set-name'; playerId: string; gameId: string; name: string }
  | { event: 'move'; playerId: string; steps: number }

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
