import type { LatLng } from '~~/lib/geo'
import type { FinalChallengeAnswer } from './challenges/final-challenge.type'
import type { UniqueCategoryId } from './challenges/group-modes.type'
import type { GameConfiguration, Game, GameVariant } from './game.types'
import type { ISOCountryCode } from './geography.types'

/** What a live guess was, so the room can colour it. `presence` carries no
 *  verdict — only that the player answered. `taken` is a contested-pool
 *  collision: a right name that a rival already claimed, which is neither a
 *  hit nor a miss and reads as neither. */
export type GuessKind = 'wrong' | 'correct' | 'probe' | 'locked' | 'presence' | 'taunt' | 'taken'

/** The only cheers that exist — the server whitelists against this set, and
 *  clients render by indexing into it rather than echoing payload strings. */
export const CHEER_EMOJIS = ['👏', '🔥', '😅', '⏳', '🫶'] as const
export type CheerEmoji = (typeof CHEER_EMOJIS)[number]

/** Local cooldown between cheers — UX pacing only; the server's token bucket
 *  is the real guard. One token, two strips (board panel, spectate bar). */
export const CHEER_COOLDOWN_MS = 1000

export type ClientEventData =
  | {
      event: 'join'
      variant: GameVariant
      /** Honored only when the table is full: take the balcony instead of a
       *  seat. While seats are free a joiner always plays (see joinVerdict). */
      asSpectator?: boolean
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
      /** Staleness echo: the round this answer belongs to. A socket-buffered
       *  submit flushing after the settle auto-advanced the table must not be
       *  graded against the NEXT round's challenge. */
      roundIndex?: number
      /**
       * Client-computed points for modes the server can't reproduce (sketch
       * similarity, silhouette buzz timing). The server clamps it; correctness
       * itself is still validated server-side where possible.
       */
      clientScore?: number
      /** Buzz rounds: the clock fraction left at the moment of the buzz, for
       *  the reveal's buzz race. Reveal-only — the score is already clamped
       *  above, and `buzzScore` can't be inverted back to this. */
      buzzAt?: number
      /** Sketch rounds: the normalized drawn outline, for the reveal overlay. */
      sketch?: [number, number][]
      /** Pin-landmark rounds: where on the globe the player dropped their pin.
       *  The server scores the distance itself, so this is the whole answer. */
      pin?: LatLng
      /** Ghosts-of-empires rounds: the beat-1 buzz. `guessedId` is the empire
       *  the player named (absent = never buzzed); `clientScore` is the buzz
       *  points claimed for beat 1 alone — the server re-checks the name and
       *  clamps the claim to beat 1's share of the pot. Beat-2 taps travel in
       *  `ranking` as usual. */
      empire?: { guessedId?: string; clientScore: number }
      /** Name-that-water rounds: the feature the player settled on (absent =
       *  never resolved correctly). The server re-checks it against the dealt
       *  feature and zeroes the claim on a miss — same posture as `empire`. */
      water?: { guessedId?: string; guessedName?: string }
    }
  | {
      event: 'submit-individual-challenge-answer'
      isoCode: ISOCountryCode
      /** Timed gates (border-detective): fraction of the clock left at submit.
       *  Scales the leap via the buzz curve; the server clamps it. */
      remainingFraction?: number
      /** Timed gates: how many hints were bought (outline, ISO code) — each
       *  bites `GATE_HINT_BITE_STEPS` off the leap, floored at zero. */
      hintsUsed?: number
      /** The gate being answered (`endTile.position` of the head move) — the
       *  same echo-token posture as `submit-chain-move`'s `turn`: an ack
       *  redelivery that lands after the walk reached the NEXT gate can't be
       *  judged against it. */
      gateTile?: number
    }
  | {
      /** Turn-chain rounds (Border Chain, Atlas): the active player extends
       *  the chain. `turn` echoes the
       *  state's turn counter so a retried/duplicated send can never land as a
       *  second move. */
      event: 'submit-chain-move'
      isoCode: ISOCountryCode
      turn: number
    }
  | {
      /** Heritage Hunt: a pin for the live beat. `beat` echoes the state's
       *  beat index so a retried send can't land on a later photo. */
      event: 'submit-heritage-pin'
      beat: number
      pin: LatLng
    }
  | {
      /** Timeline: the active player slots the drawn card into the line.
       *  `turn` echoes the state's turn counter so a retried/duplicated send
       *  can never land as a second placement. */
      event: 'submit-timeline-placement'
      slot: number
      turn: number
    }
  | {
      /** Manhunt: the despot's forced hop. Kind (ground vs sea passage) is
       *  inferred server-side, preferring ground so no charge is wasted.
       *  `turn` echoes the state's beat counter — a retried send can't land
       *  as a second move. */
      event: 'submit-manhunt-move'
      isoCode: ISOCountryCode
      turn: number
    }
  | {
      /** Manhunt: a detective's marker for the live hunt beat. The marker
       *  itself stays off the broadcast (presence-only) — it lands in the
       *  round's secret blob. */
      event: 'submit-manhunt-marker'
      isoCode: ISOCountryCode
      turn: number
    }
  | {
      /** Manhunt: a detective spends a subpoena token to force a clue onto
       *  their chosen topic, mid hunt beat. `turn` echoes the beat counter so
       *  a retried send can't spend two tokens. */
      event: 'submit-manhunt-subpoena'
      topic: string
      turn: number
    }
  | {
      /** Manhunt: a player dismissed their briefing card. The round's first
       *  clock starts when everyone has (or the briefing cap forces it). */
      event: 'manhunt-ready'
    }
  | {
      /** Manhunt: an ephemeral taunt — an index into the sender's role list
       *  (MANHUNT_TAUNTS), never free text. Pure relay, no state. */
      event: 'manhunt-taunt'
      index: number
    }
  | {
      /** Manhunt: the despot's client asks for its own trail (reconnect
       *  path). Answered with a targeted 'manhunt-position' emit; ignored for
       *  anyone but the despot. */
      event: 'fetch-manhunt-position'
    }
  | {
      /** Unique or Bust: a player dismissed their briefing card. The writing
       *  clock starts when everyone has (or the briefing cap forces it). */
      event: 'unique-ready'
    }
  | {
      /** Turn-chain rounds: a player dismissed their briefing card. The first shot
       *  clock starts when everyone has (or the briefing cap forces it). */
      event: 'chain-ready'
    }
  | {
      /** Unique or Bust: lock one board slot to a register entry. The pick
       *  stays off the broadcast (presence-only) — it lands in the round's
       *  secret blob until the reveal. A repeat on a locked slot is a no-op. */
      event: 'submit-unique-answer'
      category: UniqueCategoryId
      id: string
    }
  | {
      /** Clean Sweep: a player dismissed their briefing card. The board's one
       *  clock starts when everyone has (or the briefing cap forces it). */
      event: 'sweep-ready'
    }
  | {
      /** Clean Sweep: claim a slot off the shared board. Unlike its blind
       *  siblings the pick is PUBLIC — it lands on the snapshot and paints the
       *  board for the room. Serialized by the per-game queue, so two seats
       *  racing the same name resolve as claim-then-collision, never both. */
      event: 'submit-sweep-claim'
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
      /** Server-only: how many round-advance watchdog re-checks have fired for
       *  this settle. Bounds the self-sustaining poll so a seat that never
       *  returns cannot spin a timer for the life of the room. */
      watchdogTick?: number
      /** Server-only: the player's walk generation this continuation was armed
       *  under. A mismatch on arrival means the moveset changed since — the
       *  timer is stale and must not step the pawn. */
      walkSeq?: number
    }
  | {
      event: 'update-by-index'
      value: string | number | boolean
      accessorPattern: string
    }
  | {
      event: 'submit-final-challenge-answer'
      submittedAnswer: FinalChallengeAnswer
      /** Staleness echo, the gates' `gateTile` posture: the gauntlet turn
       *  this answer was given on. An answer that lost the race with the
       *  question cap must not consume the replacement question. */
      turn?: number
    }
  | {
      event: 'update-configuration'
      configuration: GameConfiguration
    }
  | {
      /** Host-only door policy for watchers. Deliberately NOT part of
       *  GameConfiguration: configuration freezes at start-game (it regenerates
       *  tiles), while the spectator door must swing mid-race too. */
      event: 'set-spectator-access'
      allowed: boolean
    }
  | {
      /** Host removes a seated player pre-start; the seat frees and the id is
       *  denylisted for this game (see kick-player.handler.ts). */
      event: 'kick-player'
      targetId: string
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

/**
 * State-advancing events the game cannot recover from losing: these are sent
 * with a socket.io ack and retried until the server confirms handling. A lost
 * one wedges the whole room (e.g. a Continue click swallowed by a reconnect
 * gap). Ephemeral relays and lobby edits stay fire-and-forget — losing one
 * costs nothing or is trivially redone by the player.
 */
export const CRITICAL_CLIENT_EVENTS = [
  'start-game',
  'close-tutorial',
  'enter-movement-phase',
  'submit-group-challenge-answers',
  'submit-individual-challenge-answer',
  'submit-final-challenge-answer',
  'submit-chain-move',
  'submit-heritage-pin',
  'submit-timeline-placement',
  'submit-manhunt-move',
  'submit-manhunt-marker',
  'submit-manhunt-subpoena',
  'manhunt-ready',
  'unique-ready',
  'chain-ready',
  'submit-unique-answer',
] as const satisfies readonly ClientEvent[]
export type CriticalClientEvent = (typeof CRITICAL_CLIENT_EVENTS)[number]

export const isCriticalClientEvent = (event: ClientEvent): event is CriticalClientEvent =>
  (CRITICAL_CLIENT_EVENTS as readonly ClientEvent[]).includes(event)

/** Server → client receipt for critical events. */
export type ClientEventAck =
  | { ok: true }
  /** 'unbound': the socket lost its player binding (reconnect before re-join)
   *  — the client should re-join, then retry. 'error': the handler threw
   *  (fail fast, a retry fails identically). 'resolving': a RetryableReject —
   *  the seat's result-beat latch is up; the same payload lands once the
   *  hold clears, so KEEP retrying. */
  | { ok: false; reason: 'unbound' | 'error' | 'resolving' }

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
  /** Join refused — the table is at MAX_PLAYERS. Same no-`game` contract.
   *  `spectatable`: the door is open and a watcher slot is free — the socket
   *  was left CONNECTED so "Watch instead" can just re-emit join. */
  | { event: 'room-full'; spectatable?: boolean }
  /** Join refused — the host removed this player from the game. Terminal;
   *  same no-`game` contract as the other refusals. */
  | { event: 'removed-from-room' }
  /** ONE seat changed (the acting player): the client applies only
   *  `players[actor]`. A write that touched more than one seat — or any
   *  round-level field — must ride 'table-updated' instead, or every other
   *  change is silently dropped on every client. */
  | { event: 'update'; game: Game }
  /** Whole-table change outside a mode's own `*-updated` event (a settle
   *  advancing a cohort, a cap flipping several seats, a round-level stamp) —
   *  full snapshot replace client-side. */
  | { event: 'table-updated'; game: Game }
  | { event: 'configuration-updated'; game: Game }
  | { event: 'individual-challenge-checked'; game: Game }
  /** Turn-chain rounds (Border Chain, Atlas): a turn advanced (move, strike, elimination, fresh chain,
   *  or finish) — the whole room re-renders the chain from the snapshot. */
  | { event: 'chain-updated'; game: Game }
  /** Heritage Hunt: a beat resolved or advanced — whole-table state. */
  | { event: 'heritage-updated'; game: Game }
  /** Timeline: a placement resolved, the reveal held, or the next turn began —
   *  whole-table state. */
  | { event: 'timeline-updated'; game: Game }
  /** Manhunt: a beat advanced or the round resolved — whole-table state. */
  | { event: 'manhunt-updated'; game: Game }
  /** Unique or Bust: the briefing gate, a slot lock, or the collision reveal —
   *  whole-table state. */
  | { event: 'unique-updated'; game: Game }
  /** Clean Sweep: the briefing gate, a claim landing, or the board resolving —
   *  whole-table state. Also how a seat that LOST a race learns it: the
   *  snapshot comes back with the slot held by someone else. */
  | { event: 'sweep-updated'; game: Game }
  /** Manhunt: the despot's own trail, emitted ONLY to the despot's socket —
   *  never broadcast. `turn` stamps which beat the trail was current at. */
  | { event: 'manhunt-position'; trail: ISOCountryCode[]; turn: number }
  /** Manhunt: a relayed taunt. `role` picks the phrase list; `index` the
   *  line. The sender id is the socket's authenticated id. */
  | {
      event: 'manhunt-taunt'
      playerId: string
      role: 'despot' | 'detective'
      index: number
      entryId: string
      at: number
    }
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

/** Pointer rests on (or leaves) a country — `isoCode` absent over open water.
 *  Mouse-only by design: hover is not a touch idiom. */
export type MapHoverEvent = CustomEvent<{ isoCode?: ISOCountryCode | string }>

export const isMapHoverEvent = (event: Event): event is MapHoverEvent => {
  return event && Reflect.has(event, 'detail')
}
