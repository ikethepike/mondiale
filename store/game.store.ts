import { defineStore } from 'pinia'
import { isTraversalChallenge } from '~~/types/challenges/traversal-challenge.type'
import type { Game, GroupChallengeAnswer, PlayerTurn, Round } from '~~/types/game.types'
import type { ISOCountryCode } from '~~/types/geography.types'
import type { Player } from '~~/types/player.type'
import type { Socket } from 'socket.io-client'
import type { DefaultEventsMap } from 'socket.io'

interface GameStoreState {
  game?: Game
  playerId: string
  map: {
    reveal?: ISOCountryCode
    status?: 'incorrect' | 'correct'
    highlighted: Set<ISOCountryCode>
    /** Shapes-only mode: only highlighted/tinted countries render (traversal). */
    solo: boolean
    /** Show ISO acronym labels on countries (easy traversal aid). */
    labels: boolean
    /** Countries the map camera should frame together. */
    focus: ISOCountryCode[]
    /** Soft per-country verdict fills for traversal guesses. */
    tints: { [isoCode in ISOCountryCode]?: MapTint }
  }
  /**
   * Set when the player closes the group scores; the 3D board clears it and
   * emits 'enter-movement-phase' once the scene is actually ready, so every
   * server step tick lands as a visible pawn hop instead of being swallowed
   * while the board is still loading.
   */
  pendingMovementRequest: boolean
  socket?: Socket<DefaultEventsMap, DefaultEventsMap>
}

export const useGameStore = defineStore('game', {
  state: (): GameStoreState => ({
    game: undefined,
    playerId: '',
    socket: undefined,
    pendingMovementRequest: false,
    map: {
      status: undefined,
      reveal: undefined,
      highlighted: new Set([]),
      solo: false,
      labels: false,
      focus: [],
      tints: {},
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
    currentGroupChallengeForPlayer(state): ISOCountryCode[] | undefined {
      const round = this.currentRound?.round
      if (!round) return undefined
      if (!state.playerId) return undefined
      if (isTraversalChallenge(round.groupChallenge)) return undefined

      return round.groupChallenge.countriesPerPlayer[state.playerId]
    },
    playersByPhase(state) {
      const players = Object.values(state.game?.players || [])

      return {
        waiting: players.filter(player => !player.ready),
        ready: players.filter(player => player.ready),
        all: players,
      }
    },
    playerScore(state): PlayerScore {
      if (!state.playerId) return undefined
      if (!this?.currentRound) return undefined
      const { groupAnswers, playerTurns } = this.currentRound.round

      return {
        ordering: groupAnswers[state.playerId] || [],
        points: playerTurns[state.playerId]?.points || 0,
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

      return Object.values(state.game.players).sort((a, b) => {
        const aFinished = a.completedAtRound ?? Infinity
        const bFinished = b.completedAtRound ?? Infinity
        if (aFinished !== bFinished) return aFinished - bFinished
        return b.currentPosition - a.currentPosition
      })
    },
  },
})

export interface Scorecard {
  player: Player
  score?: PlayerTurn
  answers?: GroupChallengeAnswer
}

/** Traversal guess verdicts painted onto the map. */
export type MapTint = 'optimal' | 'inefficient' | 'stray' | 'endpoint'

export type PlayerScore =
  | {
      points: PlayerTurn['points']
      ordering: GroupChallengeAnswer
    }
  | undefined
