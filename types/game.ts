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
  points: number
}

export type Command =
  | { event: 'connect'; gameId: string }
  | { event: 'set-name'; playerId: string; gameId: string; name: string }

export interface Turn {
  number: number
  player: Player
}
