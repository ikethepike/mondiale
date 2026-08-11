<template>
  <h1 class="map-caption">Whose party is this?</h1>
  <div v-if="challenge.partyLogo" class="logo-frame">
    <img class="party-logo" :src="challenge.partyLogo.image" alt="" />
  </div>
  <div class="gate-options card-options logo-options">
    <button
      v-for="option in challenge.options"
      :key="option"
      class="card-option"
      type="button"
      @click="submitAnswer(option)"
    >
      <CountryChip tag="span" :country="getCountry(option)" />
    </button>
  </div>
</template>

<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import { getCountry } from '~~/lib/country'
import { useGateChallenge } from '~~/lib/use-gate-challenge'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'

/**
 * A party's logo, and the country it belongs to.
 *
 * The logo is the whole question, so it stands alone above the options with
 * nothing else to read — a party NAME beside it would answer the question
 * outright for half the roster ("Sweden Democrats"). The name only appears in
 * the reveal.
 */
defineProps<{ challenge: IndividualChallenge }>()

const { submitAnswer } = useGateChallenge()
</script>

<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.logo-frame {
  // Party logos are wordmarks on transparent backgrounds, drawn for a white
  // page — the cream scrim is what keeps a dark one legible over the map.
  @include caption-surface($cardRadius);

  display: grid;
  place-items: center;
  width: min(22rem, 68vw);
  aspect-ratio: 3 / 2;
  margin: 0 auto;
  padding: 1.25rem;
  pointer-events: auto;
}

.party-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.logo-options {
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (min-width: $tablet) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
