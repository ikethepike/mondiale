<template>
  <h1 class="map-caption">Who leads {{ countryName(challenge.country) }}?</h1>
  <div class="gate-options card-options leader-options">
    <button
      v-for="option in challenge.options"
      :key="option"
      class="card-option leader-option"
      type="button"
      @click="submitAnswer(option)"
    >
      <span
        v-if="leaderPortrait(option)"
        class="leader-thumb"
        :style="{ backgroundImage: `url(${leaderPortrait(option)})` }"
        aria-hidden="true"
      />
      <span v-else class="leader-thumb placeholder" aria-hidden="true" />
      <span class="leader-name">{{
        titlecaseLeader(getCountry(option).government?.leader ?? '')
      }}</span>
      <span v-if="leaderFacts(option).length" class="fact-row">
        <span v-for="fact in leaderFacts(option)" :key="fact" class="fact">{{ fact }}</span>
      </span>
    </button>
  </div>
</template>
<script lang="ts" setup>
import { countryName, getCountry } from '~~/lib/country'
import { leaderHintFacts, politicalLeader, titlecaseLeader } from '~~/lib/leaders'
import { useGateChallenge } from '~~/lib/use-gate-challenge'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

defineProps<{ challenge: IndividualChallenge }>()

const { isHard, submitAnswer } = useGateChallenge()

const leaderPortrait = (isoCode: ISOCountryCode) => politicalLeader(isoCode)?.image
// Hard mode gets bare names; easy/normal see party and tenure under each option.
const leaderFacts = (isoCode: ISOCountryCode): string[] => {
  if (isHard.value) return []
  const leader = politicalLeader(isoCode)
  return leader ? leaderHintFacts(leader, isoCode) : []
}
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
