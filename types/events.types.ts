import { Game, GameVariant, PlayerColor } from './game.types'
import { ISOCountryCode } from './geography.types'

export type ClientEventData =
  | {
      event: 'join'
      variant: GameVariant
    }
  | {
      name: string
      event: 'set-name'
    }
  | {
      event: 'set-color'
      color: PlayerColor
    }
  | {
      event: 'start-game'
    }
  | {
      event: 'submit-group-challenge-answers'
      ranking: ISOCountryCode[]
    }
  | {
      event: 'submit-individual-challenge-answer'
      isoCode: ISOCountryCode
    }
  | {
      event: 'ready-for-round'
    }
  | {
      event: 'close-tutorial'
    }
  | {
      event: 'enter-movement-phase'
    }
  | {
      event: 'ready-for-round'
    }

export type ClientEvent = ClientEventData['event']

export interface ClientEventTarget {
  gameId: string
  playerId: string
}

export const isValidClientEventTarget = (data: any): data is ClientEventTarget =>
  typeof data === 'object' &&
  ['gameId', 'playerId'].every(key => {
    if (!Reflect.has(data, key)) return false
    return !!data[key]
  })

export type ServerEventData =
  | { event: 'player-joined'; game: Game }
  | { event: 'name-set'; game: Game }
  | { event: 'color-set'; game: Game }
  | { event: 'new-round'; game: Game }
  | { event: 'group-challenge-scored'; game: Game }
  | { event: 'game-started'; game: Game }
  | { event: 'game-already-started'; game: Game }
  | { event: 'update'; game: Game }
  | { event: 'individual-challenge-checked'; game: Game }
  | { event: 'player-ready-for-round'; game: Game }

export type ServerEvent = ServerEventData['event']
