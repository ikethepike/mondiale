<template>
  <span v-if="rosetta" class="rosetta-reveal">
    <strong class="link">The link was {{ rosetta.relationLabel }}.</strong>
    <span class="pairs">
      <span class="pair">
        <span class="term">{{ rosetta.exemplar.term }}</span>
        <span class="tie" aria-hidden="true">→</span>
        <CountryChip :country="getCountry(rosetta.exemplar.isoCode)" tag="span" compact />
      </span>
      <span class="pair solved">
        <span class="term">{{ rosetta.term }}</span>
        <span class="tie" aria-hidden="true">→</span>
        <CountryChip :country="getCountry(challenge.country)" tag="span" compact />
      </span>
    </span>
  </span>
</template>
<script lang="ts" setup>
import CountryChip from '~/components/country/CountryChip.vue'
import { getCountry } from '~~/lib/country'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'

const props = defineProps<{ challenge: IndividualChallenge }>()

const rosetta = computed(() => props.challenge.rosetta)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

.rosetta-reveal {
  gap: 0.8rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

.pairs {
  gap: 0.5rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}

.pair {
  gap: 0.8rem;
  display: flex;
  align-items: center;
  opacity: 0.7;

  &.solved {
    opacity: 1;
  }
}

.term {
  font-size: 1.5rem;
  color: var(--dark-blue);
}

.tie {
  color: var(--soft-blue);
}
</style>
