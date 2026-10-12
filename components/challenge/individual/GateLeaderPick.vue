<template>
  <h1 class="map-caption">Who leads {{ countryName(challenge.country) }}?</h1>
  <div class="gate-options card-options leader-options">
    <button
      v-for="{ option, leader, facts } in cards"
      :key="option"
      class="card-option leader-option"
      type="button"
      @click="submitAnswer(option)"
    >
      <span
        v-if="leader?.image"
        class="leader-thumb"
        :style="{ backgroundImage: `url(${leader.image})` }"
        aria-hidden="true"
      />
      <span v-else class="leader-thumb placeholder" aria-hidden="true" />
      <span class="leader-name">{{ leader?.name }}</span>
      <span v-if="facts.length" class="fact-row">
        <span v-for="fact in facts" :key="fact" class="fact">{{ fact }}</span>
      </span>
    </button>
  </div>
</template>
<script lang="ts" setup>
import { countryName } from '~~/lib/country'
import { leaderHintFacts, phrasedLeader } from '~~/lib/leaders'
import { useGateChallenge } from '~~/lib/use-gate-challenge'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'

const props = defineProps<{ challenge: IndividualChallenge }>()

const { isHard, submitAnswer } = useGateChallenge()

// Hard mode gets bare names; easy/normal see party and tenure under each option.
const cards = computed(() =>
  (props.challenge.options ?? []).map(option => {
    const leader = phrasedLeader(option)
    const facts = leader && !isHard.value ? leaderHintFacts(leader, option) : []
    return { option, leader, facts }
  })
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

.leader-options {
  grid-template-columns: minmax(28rem, 44rem);
}

.fact-row {
  line-height: 1.3;
}

// A card-option on an explicit grid: portrait left, name and hint facts
// right. `display` is declared here on purpose — the card must own its
// layout even against later-imported templates.
.leader-option {
  display: grid;
  grid-template-areas: 'thumb name' 'thumb facts';
  grid-template-columns: auto 1fr;
  align-content: center;
  align-items: center;
  column-gap: 1.2rem;
  row-gap: 0.2rem;
  text-align: left;
  padding: 0.8rem 1.2rem;

  .leader-thumb {
    grid-area: thumb;
  }

  .leader-name {
    grid-area: name;
  }

  .fact-row {
    grid-area: facts;
  }
}

@media (max-width: $tablet) {
  .leader-options {
    width: min(44rem, 100%);
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
