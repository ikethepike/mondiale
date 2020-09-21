import randomWords from 'random-words'
import { ActionTree, MutationTree, GetterTree } from 'vuex'
import { generateHash } from '~/lib/hashing'
import { Game, Player } from '~/types/game'

export interface GameState {
  game?: Game
}

export const state = (): GameState => ({
  game: undefined,
})

export const actions: ActionTree<GameState, any> = {
  startGame({ commit }, name) {
    const player: Player = {
      id: generateHash(),
      points: 0,
      name,
    }

    // generate game id
    // set state
    const game: Game = {
      id: randomWords({ exactly: 3, join: '-' }),
      variant: 'world',
      players: [player],
    }
    commit('game', game)
  },
}

export const mutations: MutationTree<GameState> = {
  game(state, game: Game) {
    state.game = game
  },
}

export const getters: GetterTree<GameState, any> = {}
