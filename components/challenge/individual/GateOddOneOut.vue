<template>
  <template v-if="challenge.oddOneOut">
    <h1 class="map-caption">{{ challenge.oddOneOut.propertyLabel }}</h1>
    <span class="map-caption sub">Pick the one that doesn't belong</span>
    <div class="gate-options card-options">
      <button
        v-for="option in challenge.oddOneOut.countries"
        :key="option"
        class="card-option"
        type="button"
        @click="submitAnswer(option)"
      >
        <CountryFlag class="option-flag" :country="getCountry(option)" mode="background" />
        <span>{{ countryName(option) }}</span>
      </button>
    </div>
  </template>
</template>
<script lang="ts" setup>
import CountryFlag from '~/components/country/CountryFlag.vue'
import { countryName, getCountry } from '~~/lib/country'
import { useGateChallenge } from '~~/lib/use-gate-challenge'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'

defineProps<{ challenge: IndividualChallenge }>()

const { submitAnswer } = useGateChallenge()
</script>
