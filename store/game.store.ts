import { defineStore } from 'pinia'
import { Game, GroupChallengeAnswer, PlayerTurn, Round } from '~~/types/game.types'
import { ISOCountryCode } from '~~/types/geography.types'
import { PlayerPhase } from '~~/types/player.type'
import { io, Socket } from 'socket.io-client'
import { DefaultEventsMap } from 'socket.io/dist/typed-events'

interface GameStoreState {
  game?: Game
  playerId: string
  socket?: Socket<DefaultEventsMap, DefaultEventsMap>
}

export const useGameStore = defineStore('game', {
  state: (): GameStoreState => ({
    game: undefined,
    playerId: '',
    socket: undefined,
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
        number: length,
      }
    },
    currentGroupChallengeForPlayer(state): ISOCountryCode[] | undefined {
      const round = this.currentRound?.round
      if (!round) return undefined
      if (!state.playerId) return undefined

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
      const { groupAnswers, playerTurns } = this.currentRound?.round

      return {
        ordering: groupAnswers[state.playerId] || [],
        points: playerTurns[state.playerId]?.points || 0,
      }
    },
  },
})

export type PlayerScore =
  | {
      points: PlayerTurn['points']
      ordering: GroupChallengeAnswer
    }
  | undefined
