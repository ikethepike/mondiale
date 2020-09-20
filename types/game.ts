export type Variant =
  | 'world'
  | 'europe'
  | 'africa'
  | 'north-america'
  | 'south-america'
  | 'asia'

export interface Game {
  id: string
  players: Player[]
  variant: Variant
}

export interface Player {
  id: string
  name: string
}

export interface Turn {
  number: number
  player: Player
}
