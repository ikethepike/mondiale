<template>
  <h1 class="map-caption">Which country uses this currency?</h1>
  <div v-if="note" class="money-hero money-hero-photo">
    <img class="money-note" :src="note" alt="A banknote" />
  </div>
  <div v-else-if="glyph" class="money-hero" aria-hidden="true">
    <span class="money-symbol">{{ glyph }}</span>
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
import { useGateChallenge } from '~~/lib/use-gate-challenge'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'

const props = defineProps<{ challenge: IndividualChallenge }>()

const note = computed(() => {
  const money = props.challenge.money
  return money && 'image' in money ? money.image : undefined
})
const glyph = computed(() => {
  const money = props.challenge.money
  return money && 'glyph' in money ? money.glyph : undefined
})

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
