import type { LatLng } from '~~/lib/geo'
import type { GameConfiguration, Game, GameVariant } from './game.types'
import type { ISOCountryCode, Region } from './geography.types'

/** What a live guess was, so the room can colour it. `presence` carries no
 *  verdict — only that the player answered. */
export type GuessKind = 'wrong' | 'correct' | 'probe' | 'locked' | 'presence'

/** The only cheers that exist — the server whitelists against this set, and
 *  clients render by indexing into it rather than echoing payload strings. */
export const CHEER_EMOJIS = ['👏', '🔥', '😅', '⏳', '🫶'] as const
export type CheerEmoji = (typeof CHEER_EMOJIS)[number]

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
      /** Pin-landmark rounds: where on the globe the player dropped their pin.
       *  The server scores the distance itself, so this is the whole answer. */
      pin?: LatLng
    }
  | {
      event: 'submit-individual-challenge-answer'
      isoCode: ISOCountryCode
      /** Timed gates (border-detective): fraction of the clock left at submit.
       *  Scales the leap via the buzz curve; the server clamps it. */
      remainingFraction?: number
      /** Timed gates: an outline hint was bought — bites one step off the leap. */
      hintUsed?: boolean
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
       *  state (like update-by-index). `isoCode`/`label` are omitted under a
       *  presence-only policy, and stripped again server-side regardless. */
      event: 'player-guessing'
      kind: GuessKind
      isoCode?: ISOCountryCode
      label?: string
    }
  | {
      /** Ephemeral emoji cheer aimed at another player's pawn. Pure relay —
       *  writes no permanent state; the server whitelists the emoji and checks
       *  the target exists before rebroadcasting. */
      event: 'player-cheering'
      targetPlayerId: string
      emoji: CheerEmoji
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
  /** Join refused — deliberately carries no `game`, so `hasGame()` stays false
   *  and the generic store-write can never strand the client mid-join. */
  | { event: 'game-already-started' }
  | { event: 'update'; game: Game }
  | { event: 'configuration-updated'; game: Game }
  | { event: 'individual-challenge-checked'; game: Game }
  | { event: 'index-update'; accessorPattern: string; value: string | number | boolean }
  | { event: 'final-challenge-checked'; game: Game }
  | {
      event: 'player-guessing'
      /** The socket's authenticated id — never taken from the payload body. */
      playerId: string
      kind: GuessKind
      isoCode?: ISOCountryCode
      label?: string
      /** Hot & Cold: distance from the probe to the hidden target, computed and
       *  rounded server-side. Broadcast under 'presence' where isoCode is not —
       *  a radius carries no bearing on its own. */
      distanceKm?: number
      /** Stamped server-side; keys the ticker so each guess is its own entry. */
      entryId: string
      at: number
    }
  | {
      event: 'player-cheering'
      /** The socket's authenticated id — never taken from the payload body. */
      playerId: string
      targetPlayerId: string
      emoji: CheerEmoji
      entryId: string
      at: number
    }

export type ServerEvent = ServerEventData['event']

/** The server events that carry a full game snapshot. */
export type GameServerEvent = Extract<ServerEventData, { game: Game }>

/**
 * Narrows away the events with no `game` payload (`index-update`,
 * `player-guessing`). Testing for the field rather than listing the event
 * names keeps later game-less events handled automatically.
 */
export const hasGame = (payload: ServerEventData): payload is GameServerEvent => {
  return 'game' in payload
}

export type MapClickEvent = CustomEvent<{
  isoCode: ISOCountryCode | string
  /**
   * Where on the globe the click landed, from inverting the map's Robinson
   * projection. Absent when the point lies outside the projection's silhouette.
   * Powers pin-the-landmark's distance scoring.
   */
  latLng?: LatLng
}>

export const isMapClickEvent = (event: Event): event is MapClickEvent => {
  return event && Reflect.has(event, 'detail')
}
