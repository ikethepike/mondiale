import { defineStore } from 'pinia'
import { countries } from '../george/compiled/countries.json'

export const useCountryStore = defineStore({
  id: 'countryStore',
  state: () => ({
    countries,
  }),
})
