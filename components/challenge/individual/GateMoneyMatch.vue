<template>
  <h1 class="map-caption">Which country uses this currency?</h1>
  <div v-if="challenge.image" class="money-hero money-hero-photo">
    <img class="money-note" :src="challenge.image" alt="A banknote" />
    <span class="money-code">{{ getCountry(challenge.country).currency }}</span>
  </div>
  <div v-else class="money-hero" aria-hidden="true">
    <span class="money-symbol">{{ currencySymbol(getCountry(challenge.country).currency) }}</span>
    <span class="money-code">{{ getCountry(challenge.country).currency }}</span>
  </div>
  <div class="gate-options card-options">
    <button
      v-for="option in challenge.options"
      :key="option"
      class="card-option"
      type="button"
      @click="submitAnswer(option)"
    >
      <CountryTileFlag class="option-flag" :country="getCountry(option)" />
      <span>{{ countryName(option) }}</span>
    </button>
  </div>
</template>
<script lang="ts" setup>
import CountryTileFlag from '~/components/country/CountryTileFlag.vue'
import { countryName, getCountry } from '~~/lib/country'
import { currencySymbol } from '~~/lib/currency'
import { useGateChallenge } from '~~/lib/use-gate-challenge'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'

defineProps<{ challenge: IndividualChallenge }>()

const { submitAnswer } = useGateChallenge()
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

// The currency glyph IS the question — big and editorial.
.money-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  margin: 1.6rem 0 0.4rem;

  .money-symbol {
    font-size: 8rem;
    line-height: 1;
    font-weight: 700;
    color: var(--dark-blue);
    font-family: 'Lusitana', serif;
  }
  .money-code {
    font-size: 1.6rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--soft-blue);
  }
}

// Banknote hero: bound by both width and height so portrait notes still leave
// room for the option cards below (no scroll).
.money-hero-photo {
  gap: 0.8rem;

  .money-note {
    width: auto;
    height: auto;
    max-width: min(40rem, 90vw);
    max-height: 42vh;
    object-fit: contain;
    border-radius: 0.6rem;
    box-shadow: 0 0.6rem 1.8rem ink(0.28);
  }
}

@media (max-width: $tablet) {
  .money-hero-photo .money-note {
    max-height: 34vh;
  }
  .money-hero .money-symbol {
    font-size: 6rem;
  }
}
</style>
