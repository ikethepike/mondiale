import { defineStore } from 'pinia'
import { update } from '../lib/CSE'
import { Game, GameOptions, Player, Round, Variant } from '../types/game'

interface GameState {
  game: Game
  playerId?: string
}

export interface ActiveRound extends Round {
  answered: boolean
}

export const useGameStore = defineStore({
  id: 'gameStore',
  state: (): GameState => ({
    game: undefined,
    playerId: undefined,
  }),
  getters: {
    getCurrentPlayer: state => {
      const { game, playerId } = state
      if (!game || !playerId) return undefined

      return game.players[playerId]
    },
    getCurrentPhase: state => {
      if (!state.playerId || !state.game) {
        return {
          naming: false,
          waiting: false,
          playing: false,
        }
      }

      const player = state.game.players[state.playerId]

      return {
        naming: !player.name,
        playing: Boolean(state.game.rounds.length),
        waiting: Boolean(player.name) && state.game.rounds.length === 0,
      }
    },
    getCurrentRound: (state): ActiveRound => {
      const { game, playerId } = state
      if (!game || !playerId) return undefined

      const round = game.rounds[game.rounds.length - 1]
      if (!round) return undefined

      return { ...round, answered: Boolean(round.challenges[playerId].answers?.length > 0) }
    },
  },
  actions: {
    async connect({
      gameId,
      playerId,
      variant,
      options,
    }: {
      gameId: string
      playerId: string
      variant: Variant
      options?: GameOptions
    }): Promise<void> {
      try {
        const { game } = await update<{ game: Game; player: Player }>({
          event: 'connect',
          gameId,
          playerId,
          options,
          variant,
        })

        this.game = game
        this.playerId = playerId

        return Promise.resolve()
      } catch (e) {
        return Promise.reject(e)
      }
    },
  },
})
