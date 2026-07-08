import type { GameConfiguration, Game, GameVariant } from './game.types'
import type { ISOCountryCode, Region } from './geography.types'

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
      /** Step to the next/previous free colour; omit for a random one. */
      direction?: 'next' | 'previous'
    }
  | {
      event: 'start-game'
    }
  | {
      event: 'submit-group-challenge-answers'
      /** The mode's ISO list: a ranking, a guess trail, or named neighbours. */
      ranking: ISOCountryCode[]
      /**
       * Client-computed points for modes the server can't reproduce (sketch
       * similarity, silhouette buzz timing). The server clamps it; correctness
       * itself is still validated server-side where possible.
       */
      clientScore?: number
      /** Sketch rounds: the normalized drawn outline, for the reveal overlay. */
      sketch?: [number, number][]
    }
  | {
      event: 'submit-individual-challenge-answer'
      isoCode: ISOCountryCode
    }
  | {
      event: 'close-tutorial'
    }
  | {
      event: 'enter-movement-phase'
      /** Server-only: marks a walk's own rescheduled step so the duplicate
       *  guard lets it through. Never sent by clients (they bypass no guard by
       *  setting it — Fix #1 binds the socket to its own playerId). */
      continuation?: boolean
    }
  | {
      event: 'update-by-index'
      value: string | number | boolean
      accessorPattern: string
    }
  | {
      event: 'submit-final-challenge-answer'
      submittedAnswer:
        | { _type: 'region-challenge'; region: Region }
        | { _type: 'min-challenge'; isoCode: ISOCountryCode }
        | { _type: 'max-challenge'; isoCode: ISOCountryCode }
        | { _type: 'leadership-challenge'; isoCode: ISOCountryCode }
        | { _type: 'language-challenge'; isoCode: ISOCountryCode }
        | { _type: 'membership-challenge'; isoCode: ISOCountryCode }
    }
  | {
      event: 'update-configuration'
      configuration: GameConfiguration
    }
  | {
      /** Ephemeral live guess during a group round — broadcast to the room so
       *  everyone sees opponents' picks land in real time. Writes no permanent
       *  state (like update-by-index). */
      event: 'player-guessing'
      isoCode: ISOCountryCode
    }

export type ClientEvent = ClientEventData['event']

export interface ClientEventTarget {
  gameId: string
  playerId: string
}

export const isValidClientEventTarget = (data: unknown): data is ClientEventTarget =>
  typeof data === 'object' &&
  data !== null &&
  ['gameId', 'playerId'].every(key => {
    if (!Reflect.has(data, key)) return false
    return !!(data as Record<string, unknown>)[key]
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
  | { event: 'configuration-updated'; game: Game }
  | { event: 'individual-challenge-checked'; game: Game }
  | { event: 'index-update'; accessorPattern: string; value: string | number | boolean }
  | { event: 'final-challenge-checked'; game: Game }
  | { event: 'player-guessing'; playerId: string; isoCode: ISOCountryCode }

export type ServerEvent = ServerEventData['event']

export type MapClickEvent = CustomEvent<{
  isoCode: ISOCountryCode | string
}>

export const isMapClickEvent = (event: Event): event is MapClickEvent => {
  return event && Reflect.has(event, 'detail')
}
