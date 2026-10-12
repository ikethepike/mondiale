import type { LatLng } from '~~/lib/geo'
import type { FinalChallengeAnswer } from './challenges/final-challenge.type'
import type {
  ManhuntPosition,
  ManhuntReading,
  UniqueCategoryId,
  VintageOutcome,
} from './challenges/group-modes.type'
import type { GameConfiguration, Game, GameVariant } from './game.types'
import type { ISOCountryCode } from './geography.types'
import { SEAT_STEPS, type SeatStep } from './seat.types'

/** What a live guess was, so the room can colour it. `presence` carries no
 *  verdict — only that the player answered. `taken` is a contested-pool
 *  collision: a right name that a rival already claimed, which is neither a
 *  hit nor a miss and reads as neither. */
export type GuessKind = 'wrong' | 'correct' | 'probe' | 'locked' | 'presence' | 'taunt' | 'taken'

/**
 * How a floating hint READS, which is a different question from what it says.
 *
 * `alert` is the coral of a genuine miss: a guess that was wrong and cost
 * something. `neutral` is everything else, and it is most of them — a name the
 * typeahead resolved to nothing, a duplicate, a country outside the round's
 * scope, a line narrating another seat. Those are not failures, and colouring
 * them like one tells the player they erred when they did not.
 *
 * Deliberately NOT derived from `GuessKind`: a neutral bounce is announced with
 * no kind at all, so the two can never be folded together.
 */
export type HintTone = 'alert' | 'neutral'

/** The only cheers that exist — the server whitelists against this set, and
 *  clients render by indexing into it rather than echoing payload strings. */
export const CHEER_EMOJIS = ['👏', '🔥', '😅', '⏳', '🫶'] as const
export type CheerEmoji = (typeof CHEER_EMOJIS)[number]

/** Local cooldown between cheers — UX pacing only; the server's token bucket
 *  is the real guard. One token, two strips (board panel, spectate bar). */
export const CHEER_COOLDOWN_MS = 1000

/**
 * Every event that acts on a seat's cursor echoes the cursor it was sent
 * against. The server accepts it only on that subject; anything else is a
 * spent screen and gets a resync instead.
 */
export interface SeatEcho {
  subject: string
  seq: number
}

export type ClientEventData =
  | {
      event: 'join'
      /** The home-page template a NEW room opens on; an existing room ignores it. */
      variant?: GameVariant
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
  | (SeatEcho & {
      event: 'submit-group-challenge-answers'
      /** The mode's ISO list: a ranking, a guess trail, or named neighbours. */
      ranking: ISOCountryCode[]
      /** Two Truths rounds: the statement the player called the lie. */
      lie?: number
      /** Sketch rounds: the normalized drawn outline (`sketchSubmission`). The
       *  server scores it against the country itself and draws it on the reveal. */
      sketch?: [number, number][]
      /** Pin-landmark rounds: where on the globe the player dropped their pin.
       *  The server scores the distance itself, so this is the whole answer. */
      pin?: LatLng
      /** Ghosts-of-empires rounds: the beat-1 buzz. `guessedId` is the empire
       *  the player named (absent = never buzzed); the server re-checks the
       *  name and prices it off the moment the buzz opened the seat's tap
       *  window. Beat-2 taps travel in `ranking` as usual. */
      empire?: { guessedId?: string }
      /** Name-that-water rounds: every feature the player named, in order. The
       *  server grades each against the dealt feature and pays by the attempt
       *  the answer landed on. */
      water?: { guessedId?: string; guessedName?: string }[]
      /** Parliament rounds: the benches the player landed on the arc, by name.
       *  The answer is not a country, so `ranking` carries only the chamber;
       *  the server re-derives the score from these against the dealt benches
       *  and never trusts a claimed one. */
      parliament?: { placed: string[] }
      /** Vintage rounds: the year the player dated the map to. */
      year?: number
    })
  | (SeatEcho & {
      event: 'submit-individual-challenge-answer'
      isoCode: ISOCountryCode
      /** Step-graded gates (`isStepGraded`): each duel's pick, the chain after
       *  the seed, the arranged order, the ruling or the band. The server
       *  grades these (`gradeGateSteps`); `isoCode` then only names the
       *  verdict's country. */
      steps?: string[]
    })
  | (SeatEcho & {
      /** A seat bought a hint on the subject it echoes (a gate's outline, a
       *  round's 50/50). Recorded on the cursor, once per hint — the leap or
       *  the round's pay is docked by that record, never by the submit. */
      event: 'buy-hint'
      hint: string
    })
  | (SeatEcho & {
      /** A timed gauntlet stage took a name (Sunset Blitz's country, City
       *  Nocturne's city). The server keeps it only if it landed in time —
       *  the stage's verdict counts that record, never the submitted set. */
      event: 'final-light'
      name: string
    })
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
      /** Government: a player's answer to the live beat. One event for all
       *  three questions — the server branches on the beat it is holding, and
       *  `turn` echoes the state's beat counter so a pick that arrives late is
       *  dropped rather than applied to the NEXT question. */
      event: 'submit-government-pick'
      turn: number
      pick: {
        party?: string
        seats?: number
        sides?: Record<string, 'government' | 'opposition'>
      }
    }
  | {
      /** Manhunt: the despot plans next beat's hop (re-pickable until the
       *  leak is chosen). Kind (ground vs favour) is inferred server-side,
       *  preferring ground so no favour is wasted. `turn` echoes the beat
       *  counter — a retried send can't land on the next beat. */
      event: 'submit-manhunt-move'
      isoCode: ISOCountryCode
      turn: number
    }
  | {
      /** Manhunt: the despot picks which of their plan's leak options reaches
       *  the hunt, locking their beat. */
      event: 'submit-manhunt-leak'
      index: number
      turn: number
    }
  | {
      /** Manhunt: a detective's stakeout for the live beat — public, first
       *  come, one detective per country. */
      event: 'submit-manhunt-claim'
      isoCode: ISOCountryCode
      turn: number
    }
  | {
      /** Manhunt: a detective's sonar ping for the live beat — where is
       *  public, the reading returns to them alone over 'manhunt-sonar'. */
      event: 'submit-manhunt-ping'
      isoCode: ISOCountryCode
      turn: number
    }
  | {
      /** Manhunt: a detective serves a subpoena binding the despot's next
       *  leak to a topic. `turn` echoes the beat counter so a retried send
       *  can't spend two tokens. */
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
      /** Manhunt: a seat asks for its own private intel (reconnect path) —
       *  the despot's 'manhunt-position', a detective's 'manhunt-sonar'. */
      event: 'fetch-manhunt-intel'
    }
  | {
      /** Vintage: a graded seat (or a spectator) asks for a round's story.
       *  Answered with a targeted 'vintage-story' emit. */
      event: 'fetch-vintage-story'
      round: number
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
      /** Government: a player dismissed the rules card. Beat 1's clock starts
       *  when everyone has (or the briefing cap forces it). */
      event: 'government-ready'
    }
  | {
      /** Terra Incognita: a player dismissed their briefing card. The one
       *  classic clock stamps when everyone has (or the briefing cap forces
       *  it), so the atlas never starts failing under a card. */
      event: 'terra-ready'
    }
  | {
      /** Timeline: done reading the finished round's chronicle. Settle fires
       *  when every seat has acked, or the browse cap does. No turn echo —
       *  `finished` is terminal, and `revealDone` makes retries idempotent. */
      event: 'timeline-reveal-done'
    }
  | (SeatEcho & {
      /** A browsable gate reveal's explicit exit (Chronicle): end the verdict
       *  hold now instead of waiting out the browse cap. */
      event: 'gate-reveal-done'
    })
  | {
      /** Clean Sweep: claim a slot off the shared board. Unlike its blind
       *  siblings the pick is PUBLIC — it lands on the snapshot and paints the
       *  board for the room. Serialized by the per-game queue, so two seats
       *  racing the same name resolve as claim-then-collision, never both. */
      event: 'submit-sweep-claim'
      isoCode: ISOCountryCode
    }
  | (SeatEcho & {
      event: 'close-tutorial'
    })
  | (SeatEcho & {
      /** The scorecard's Continue — the one client-driven way onto the board. */
      event: 'enter-movement-phase'
    })
  | (SeatEcho & {
      /** A seat started its own clock (an audio play tap, Empire's buzz, a
       *  gate's or the gauntlet's opening card dismissed): the server stamps
       *  the seat's deadline from this moment, never later than it stood. */
      event: 'round-play'
    })
  | (SeatEcho & {
      /** A browsable round reveal's explicit exit (Trend Race): end the
       *  verdict hold now instead of waiting out the browse cap. */
      event: 'round-reveal-done'
    })
  | {
      /** A viewer finished rendering a seat's cursor: the view mounted and its
       *  transition ended. Feeds the journal and the stale-render audit;
       *  never touches the game snapshot. */
      event: 'seat-rendered'
      seatId: string
      seq: number
      step: SeatStep
      subject: string
      view: string
    }
  | {
      /** A clock-offset probe: the ack carries the server's time. */
      event: 'time-sync'
    }
  | {
      event: 'update-by-index'
      value: string | number | boolean
      accessorPattern: string
    }
  | (SeatEcho & {
      event: 'submit-final-challenge-answer'
      submittedAnswer: FinalChallengeAnswer
    })
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
      /** Host seats a computer-controlled player pre-start. Fire-and-forget
       *  like the other lobby edits — a lost click is re-clicked. */
      event: 'add-bot'
    }
  | {
      /** Host removes a bot seat pre-start. Bot-only — human seats go
       *  through kick-player and its denylist. */
      event: 'remove-bot'
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
      /** Hot & Cold: the clicked point the probe is measured from. Like the
       *  probe's isoCode it feeds the server's radius and is never echoed. */
      latLng?: LatLng
      /** Pyramid Scheme: how many subjects this player has now seated, and out
       *  of how many. A count carries the race without naming a placement —
       *  with four subjects there are only 24 arrangements, so a named one
       *  would hand the room the puzzle. */
      placed?: { seated: number; total: number }
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
  'round-play',
  'round-reveal-done',
  'submit-group-challenge-answers',
  'submit-individual-challenge-answer',
  'buy-hint',
  'submit-final-challenge-answer',
  'final-light',
  'submit-chain-move',
  'submit-heritage-pin',
  'submit-timeline-placement',
  'submit-manhunt-move',
  'submit-government-pick',
  'submit-manhunt-leak',
  'submit-manhunt-claim',
  'submit-manhunt-ping',
  'submit-manhunt-subpoena',
  'manhunt-ready',
  'unique-ready',
  'chain-ready',
  'sweep-ready',
  'government-ready',
  'terra-ready',
  'timeline-reveal-done',
  'gate-reveal-done',
  'submit-unique-answer',
] as const satisfies readonly ClientEvent[]
export type CriticalClientEvent = (typeof CRITICAL_CLIENT_EVENTS)[number]

export const isCriticalClientEvent = (event: ClientEvent): event is CriticalClientEvent =>
  (CRITICAL_CLIENT_EVENTS as readonly ClientEvent[]).includes(event)

/** Server → client receipt for critical events, stamped with the server's clock. */
export type ClientEventAck =
  | { ok: true; serverNow?: number }
  /** 'unbound': the socket lost its player binding (reconnect before re-join)
   *  — the client should re-join, then retry. 'error': the handler threw
   *  (fail fast, a retry fails identically). */
  | { ok: false; reason: 'unbound' | 'error'; serverNow?: number }

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
  /** Despite the name, the ROSTER-CHANGED snapshot: joins, kicks, bot seats
   *  added or removed all ride it (it is the one 'authoritative' full-sync
   *  event). Never key a "someone joined" surface off the event name alone. */
  | { event: 'player-joined'; game: Game }
  | { event: 'name-set'; game: Game }
  | { event: 'color-set'; game: Game }
  | { event: 'new-round'; game: Game }
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
  /** One seat's cursor moved: the seat plus its slice of the live round. */
  | { event: 'seat-advanced'; game: Game }
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
  | { event: 'government-updated'; game: Game }
  /** Unique or Bust: the briefing gate, a slot lock, or the collision reveal —
   *  whole-table state. */
  | { event: 'unique-updated'; game: Game }
  /** Clean Sweep: the briefing gate, a claim landing, or the board resolving —
   *  whole-table state. Also how a seat that LOST a race learns it: the
   *  snapshot comes back with the slot held by someone else. */
  | { event: 'sweep-updated'; game: Game }
  /** Manhunt: the despot's own trail, looted vaults and live plan, emitted
   *  ONLY to the despot's socket — never broadcast. `turn` stamps which beat
   *  it was current at. */
  | ({ event: 'manhunt-position' } & ManhuntPosition)
  /** Manhunt: one detective's own sonar readings, emitted ONLY to their
   *  socket — never broadcast. */
  | { event: 'manhunt-sonar'; readings: ManhuntReading[]; turn: number }
  /** Vintage: a round's answer and story, emitted ONLY to a socket whose
   *  seat has been graded — the years never ride a snapshot. */
  | { event: 'vintage-story'; round: number; story: VintageOutcome }
  /** A `final-light` the server did not keep (too late, or not the stage's),
   *  told to the lighting socket alone so its stage un-lights the name. */
  | { event: 'final-light-refused'; subject: string; name: string }
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
      /** Pyramid Scheme: seated-of-total, clamped server-side. Survives under
       *  'presence' for the same reason a radius does — a count says how far
       *  along a player is without saying what they decided. */
      placed?: { seated: number; total: number }
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
  /** Ephemeral table announcement (the autopilot's comings and goings, a
   *  bot leaving the table) — no game payload; clients compose the copy from
   *  the seat's name and show it on the always-mounted notice toast. */
  | {
      event: 'table-notice'
      kind: 'autopilot-engaged' | 'autopilot-reclaimed' | 'bot-removed'
      playerId: string
      entryId: string
      at: number
    }
  /** The returning player's catch-up: what the autopilot did with their seat.
   *  Broadcast like everything else, but only the named player renders it —
   *  the numbers are already public on the round history. */
  | {
      event: 'autopilot-summary'
      playerId: string
      /** Rounds the autopilot answered for the seat. */
      rounds: number
      /** Points it banked over that span. */
      scored: number
    }

/** Every server emit carries the server's clock at send time. */
export type ServerEnvelope = ServerEventData & { serverNow?: number }

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

const RENDER_FIELD_MAX = 120

/** A render ack worth storing: well-formed and bounded, whatever a client sent. */
export const isSeatRender = (
  data: ClientEventData
): data is Extract<ClientEventData, { event: 'seat-rendered' }> =>
  data.event === 'seat-rendered' &&
  typeof data.seatId === 'string' &&
  data.seatId.length <= RENDER_FIELD_MAX &&
  Number.isInteger(data.seq) &&
  (SEAT_STEPS as readonly string[]).includes(data.step) &&
  typeof data.subject === 'string' &&
  data.subject.length <= RENDER_FIELD_MAX &&
  typeof data.view === 'string' &&
  data.view.length <= RENDER_FIELD_MAX
