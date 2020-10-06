<template>
  <div id="card-view">
    <div
      v-for="country in selectedCountries"
      :key="country.countryCode"
      class="country-card"
    >
      <div class="flag" v-html="country.flag" />
      <span class="name">{{ country.name }}</span>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from 'vue'
import { Country } from '~/types/geography'

export default Vue.extend({
  props: {
    countryCodes: {
      type: Array,
      required: true,
    },
  },
  computed: {
    selectedCountries(): Country[] {
      const countries: Country[] = this.$store.state.countries
      return countries.filter((country) =>
        this.countryCodes.includes(country.countryCode)
      )
    },
  },
})
</script>
