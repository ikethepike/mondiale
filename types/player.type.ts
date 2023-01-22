import { PlayerColor } from './game.types'

export interface Player {
  id: string
  name?: string
  ready: boolean
  color: PlayerColor
  phase: PlayerPhase
}

export type PlayerPhase =
  | 'naming'
  | 'waiting-for-game'
  | 'tutorial'
  | 'group-challenge'
  | 'individual-challenge'
  | 'group-scores'
  | 'moving'
  | 'movement-summary'
  | 'kicked'
  | 'final-challenge'
  | 'victory'
