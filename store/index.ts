import { ActionTree, MutationTree } from 'vuex'
import { Country } from '../types/geography'
import { countries } from '../george/compiled/countries.json'
export interface RootState {
  countries: Country[]
}

export const state = (): RootState => ({
  countries,
})

export const actions: ActionTree<RootState, any> = {
  // nuxtServerInit({ commit }) {
  //   // commit('setCountries, countries)
  // },
}

export const mutations: MutationTree<RootState> = {
  setCountries(state, countries: Country[]) {
    state.countries = countries
  },
}
