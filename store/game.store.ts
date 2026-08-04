import { defineStore } from 'pinia'
import type { LatLng } from '~~/lib/geo'
import { compareStandings } from '~~/lib/player'
import type { CheerEmoji, GuessKind } from '~~/types/events.types'
import type { Game, GroupChallengeAnswer, PlayerTurn, Round } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import type { CountryColorGrouping, MapFeatureOverlay, MapInset } from '~~/types/map.type'
import type { Player } from '~~/types/player.type'
import type { Socket } from 'socket.io-client'
import type { DefaultEventsMap } from 'socket.io'

/** One opponent guess, as it lands in the ticker. */
export interface GuessTickerEntry {
  entryId: string
  playerId: string
  kind: GuessKind
  /** Absent under a presence-only policy — the room sees that someone guessed,
   *  not what they guessed. */
  isoCode?: ISOCountryCode
  label?: string
  /** Hot & Cold only: how far the probe fell from the hidden target, rounded
   *  server-side. A radius with no centre — the probed country stays redacted,
   *  so this raises tension without locating the answer. */
  distanceKm?: number
  at: number
}

/** One emoji cheer in flight, as broadcast by `player-cheering`. */
export interface CheerEntry {
  entryId: string
  /** Authenticated sender. */
  playerId: string
  /** Whose pawn the emoji floats over. */
  targetPlayerId: string
  emoji: CheerEmoji
  at: number
}

interface GameStoreState {
  game?: Game
  playerId: string
  /**
   * Manhunt, despot's eyes only: their own trail, arriving over the targeted
   * 'manhunt-position' emit — never in a broadcast snapshot. Cleared when a
   * new round arrives; detectives never see this populated.
   */
  manhunt?: { trail: ISOCountryCode[]; turn: number }
  map: {
    reveal?: ISOCountryCode
    /** Educational stat shown on the reveal card ("Women in parliament · 61%"). */
    revealStat?: { label: string; value: string }
    status?: 'incorrect' | 'correct'
    highlighted: Set<ISOCountryCode>
    /** Shapes-only mode: only highlighted/tinted countries render (traversal). */
    solo: boolean
    /** With solo: keep the continents as one quiet silhouette — same fill,
     *  no strokes, so internal borders vanish (ghosts-of-empires backdrop). */
    landmass: boolean
    /** Show ISO acronym labels on countries (easy traversal aid). */
    labels: boolean
    /** Chrome berth (CSS px): the camera frames its subject between these
     *  insets so a header card never covers it. */
    berth?: { top?: number; bottom?: number }
    /** Countries the map camera should frame together. */
    focus: ISOCountryCode[]
    /** Context countries whose centers stay in frame (soft inclusion). */
    focusContext: ISOCountryCode[]
    /** Frame tightness for modes whose subject is the feature itself — the
     *  default pad floor outgrows a small river or lake. */
    framePad?: { scale?: number; floor?: number }
    /** Soft per-country verdict fills for traversal guesses. */
    tints: { [isoCode in ISOCountryCode]?: MapTint }
    /** Pin-landmark: the point the player dropped, drawn as a marker. */
    pin?: LatLng
    /** Landmark reveal: the landmark's true point (pin-landmark and
     *  landmark-quiz). Drawn as a marker, with a dashed line back to `pin`
     *  when one was dropped, so the miss reads at a glance. */
    pinAnswer?: LatLng
    /** Distinct per-group country fills (region final challenge, duel pairs). */
    countryGroupings?: CountryColorGrouping[]
    /** Strait hops drawn as dashed sea arcs, as "A-B" STRAIT_CROSSINGS keys. */
    seaLinks: string[]
    /** Countries faded to half strength — off the current board. */
    dimmed: ISOCountryCode[]
    /** Countries whose fill breathes toward yellow — the Border Chain head. */
    pulsing: ISOCountryCode[]
    /** Stagger grouped fills by position — Border Chain's replay gradient. */
    staggered: boolean
    /** Post-game atlas: clicks inspect a country; suppress the terse reveal card. */
    atlasMode: boolean
    /** Zoom-Out gate: start extreme-tight on a country, ease out over N seconds
     *  so players name it before it's obvious. Cleared to stop the reveal. */
    zoomOut?: { isoCode: ISOCountryCode; durationSeconds: number }
    /** Physical-geography overlay (rivers, seas, ranges) for the water modes. */
    feature?: MapFeatureOverlay
    /** Magnifying inset for a subject too small to see at world zoom. */
    inset?: MapInset
    /** Action affordance rings — countries the player may act on right now
     *  (manhunt hops, border chain's easy-mode outs). Strokes, never fills. */
    ringed: ISOCountryCode[]
    /** Directed 'FROM>TO' overland route legs (manhunt's escape trail). */
    landRoutes: string[]
    /** Coastlines humming sea-blue — "you can sail from here". */
    seaGlow: ISOCountryCode[]
    /** Opponents' live guesses during a group round, fed by the ephemeral
     *  `player-guessing` broadcast. Append-only and self-expiring: a player's
     *  second guess is a new entry, not an overwrite, so each one can pop in
     *  and fade out on its own. */
    liveGuesses: GuessTickerEntry[]
  }
  /** Ephemeral board-view state — never persisted, never sent to the server
   *  (except cheers, which arrive via the `player-cheering` broadcast). */
  board: {
    /** Player the local camera is spectating; undefined = own camera. */
    spectateTargetId?: string
    /** Live emoji cheers, self-expiring like liveGuesses. */
    cheers: CheerEntry[]
    /** Status panel fold override; undefined = auto (folded on phones). */
    panelFolded?: boolean
    /** Round-history drawer visibility (board phases only). */
    historyOpen: boolean
  }
  /**
   * Set when the player closes the group scores; the 3D board clears it and
   * emits 'enter-movement-phase' once the scene is actually ready, so every
   * server step tick lands as a visible pawn hop instead of being swallowed
   * while the board is still loading.
   */
  pendingMovementRequest: boolean
  /**
   * The server refused the join — the game was already underway ('started'),
   * the table was at capacity ('full'), or the host removed this player
   * ('removed'). Terminal, with one exception: a spectatable 'full' refusal
   * leaves the socket connected so "Watch instead" can re-emit join; every
   * other shape closes the socket and the room page shows a dead end.
   */
  rejected: false | 'started' | 'full' | 'removed'
  /** Rode the last room-full refusal: the door is open and a watcher slot is
   *  free, so the dead-end card offers "Watch instead". */
  spectatable: boolean
  /** Watch intent for the next join emit (all three emit sites: joinRoom on
   *  mount/reconnect, the watch-instead click, the ack-recovery re-join).
   *  Client-only; reset when leaving the room page. */
  joinAsSpectator: boolean
  /**
   * A FINISHED player watching the race from their victory screen. Purely
   * client-side — they already receive every broadcast; this only swaps the
   * view. Latecomer spectators are the `isSpectator` getter instead.
   */
  spectating: boolean
  /** Spectator booth: pinned player to follow; undefined = auto-director. */
  spectateFollowId?: string
  /**
   * The seat the booth is rendering as — the followed racer's id. Written by
   * ONE owner (ViewSpectate: director cut or pin), cleared on booth unmount,
   * so for every racer `seatId === playerId` and their path is provably
   * untouched. Views resolve their seat through `seatId`, never this field.
   */
  spectateSeatId?: string
  /** Spectator booth: hide the answer secrets, pre-settle reveals and map
   *  focus glow — for a screen someone in the room might glance at. */
  spectateHideSpoilers: boolean
  socket?: Socket<DefaultEventsMap, DefaultEventsMap>
}

export const useGameStore = defineStore('game', {
  state: (): GameStoreState => ({
    game: undefined,
    playerId: '',
    manhunt: undefined,
    socket: undefined,
    pendingMovementRequest: false,
    rejected: false,
    spectatable: false,
    joinAsSpectator: false,
    spectating: false,
    spectateFollowId: undefined,
    spectateSeatId: undefined,
    spectateHideSpoilers: false,
    map: {
      status: undefined,
      reveal: undefined,
      revealStat: undefined,
      highlighted: new Set([]),
      solo: false,
      landmass: false,
      labels: false,
      focus: [],
      focusContext: [],
      framePad: undefined,
      tints: {},
      pin: undefined,
      pinAnswer: undefined,
      countryGroupings: undefined,
      seaLinks: [],
      staggered: false,
      dimmed: [],
      pulsing: [],
      atlasMode: false,
      zoomOut: undefined,
      feature: undefined,
      inset: undefined,
      ringed: [],
      landRoutes: [],
      seaGlow: [],
      liveGuesses: [],
    },
    board: {
      spectateTargetId: undefined,
      cheers: [],
      panelFolded: undefined,
      historyOpen: false,
    },
  }),
  actions: {},
  getters: {
    currentRound: (state): { round: Round; number: number } | undefined => {
      if (!state.game) return undefined
      const index = state.game.rounds.length - 1
      const round = state.game.rounds[index]
      if (!round) return undefined

      return {
        round,
        number: state.game.rounds.length,
      }
    },
    /** The identity this UI renders as: the booth's followed seat, or self.
     *  Every per-seat read goes through here; `playerId` stays the REAL
     *  identity for emits, host checks and the routing `self`. */
    seatId(state): string {
      return state.spectateSeatId ?? state.playerId
    },
    /** In the booth — a latecomer watcher or a finisher watching. The write
     *  gate in client-side.ts keys off this. */
    watching(state): boolean {
      return this.isSpectator || state.spectating
    },
    currentGroupChallengeForPlayer(): ISOCountryCode[] | undefined {
      const round = this.currentRound?.round
      if (!round) return undefined
      if (!this.seatId) return undefined
      // Only ranking rounds deal per-player hands
      if (!('countriesPerPlayer' in round.groupChallenge)) return undefined

      return round.groupChallenge.countriesPerPlayer[this.seatId]
    },
    playersByPhase(state) {
      const players = Object.values(state.game?.players || [])

      return {
        waiting: players.filter(player => !player.ready),
        ready: players.filter(player => player.ready),
        all: players,
      }
    },
    playerScore(): PlayerScore {
      if (!this.seatId) return undefined
      if (!this?.currentRound) return undefined
      const { groupAnswers, playerTurns } = this.currentRound.round

      return {
        ordering: groupAnswers[this.seatId] || [],
        points: playerTurns[this.seatId]?.points || 0,
      }
    },
    /**
     * Every player's scorecard for the current round, sorted by points scored (desc).
     * Players who haven't answered yet have no `score`/`answers` and sort last.
     */
    rankedScores(state): Scorecard[] {
      if (!state.game || !this.currentRound) return []
      const { groupAnswers, playerTurns } = this.currentRound.round

      return Object.values(state.game.players)
        .map(player => ({
          player,
          score: playerTurns[player.id],
          answers: groupAnswers[player.id],
        }))
        .sort((a, b) => (b.score?.points.scored ?? -1) - (a.score?.points.scored ?? -1))
    },
    /**
     * Overall game standings: finished players first (earliest completion round wins),
     * everyone else by how far along the board they are.
     */
    standings(state): Player[] {
      if (!state.game) return []

      return Object.values(state.game.players).sort(compareStandings)
    },
    /** Admitted through the spectator door: watching a started game from
     *  outside `players`. Ejection (door closed mid-watch) flips this false. */
    isSpectator(state): boolean {
      if (!state.game?.started || !state.playerId) return false
      if (state.game.players[state.playerId]) return false
      return !!state.game.spectators?.[state.playerId]
    },
    /** Admitted before the start: on the balcony, waiting for the race. Flips
     *  into `isSpectator` (and the booth) the moment the started snapshot
     *  lands — round 1 rides that same snapshot. */
    isWaitingSpectator(state): boolean {
      if (!state.game || state.game.started || !state.playerId) return false
      if (state.game.players[state.playerId]) return false
      return !!state.game.spectators?.[state.playerId]
    },
    spectatorCount(state): number {
      return Object.keys(state.game?.spectators ?? {}).length
    },
  },
})

export interface Scorecard {
  player: Player
  score?: PlayerTurn
  answers?: GroupChallengeAnswer
}

/** Guess verdicts painted onto the map: traversal verdicts plus hot & cold warmth. */
export type MapTint = 'optimal' | 'inefficient' | 'stray' | 'endpoint' | 'hot' | 'warm' | 'cold'

export type PlayerScore =
  | {
      points: PlayerTurn['points']
      ordering: GroupChallengeAnswer
    }
  | undefined
