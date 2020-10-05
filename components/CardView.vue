<template>
  <div id="card-view">
    <div
      v-for="country in selectedCountries"
      :key="country.countryCode"
      class="country-card"
    >
      {{ country.name }}
    </div>
  </div>
</template>
<script lang="ts">
import Vue from 'vue'
import { Country } from '~/types/geography'

export default Vue.extend({
  props: {
    cardsInView: {
      type: Number,
      default: 5,
    },
    countryCodes: {
      type: Array,
      required: true,
    },
  },
  computed: {
    selectedCountries(): Country[] {
      const countries = this.$store.state.countries
      return countries.slice(0, this.cardsInView)
    },
  },
})
</script>
