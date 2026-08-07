<template>
  <span class="trajectory-reveal">
    <span class="candidates">
      <span
        v-for="(candidate, index) in candidates"
        :key="candidate.isoCode"
        class="candidate"
        :class="{ answer: candidate.isAnswer, missed: candidate.missed }"
        :style="{ '--i': index }"
      >
        <span class="candidate-id">
          <CountryFlag
            class="candidate-flag"
            :country="getCountry(candidate.isoCode)"
            mode="background"
          />
          <span class="candidate-name">{{ countryName(candidate.isoCode) }}</span>
          <span v-if="candidate.pickedMark" class="candidate-picked">your pick</span>
        </span>
        <!-- The sparkline's own caption carries both endpoints, their years and
             the provenance — a value row here would just print the last one twice. -->
        <TrendSparkline v-if="candidate.series" :series="candidate.series" :metric="metric" />
      </span>
    </span>
  </span>
</template>
<script lang="ts" setup>
import TrendSparkline from '~/components/challenge/TrendSparkline.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import { countryName, getCountry } from '~~/lib/country'
import type { TrendMetricId } from '~~/lib/trends'
import { TRENDS } from '~~/lib/trends-data'
import type { ISOCountryCode } from '~~/types/geography.types'

/**
 * Act two of the trajectory-match reveal: every candidate's curve kept side by
 * side after the ring has turned, so the shape that won is read against the
 * three it beat rather than alone. Renders inside ChallengeResult's lesson
 * body, and stays span-built — the same shape TrendDuelReveal keeps.
 *
 * The dealer only admits options with a readable series, so no column is empty.
 */
const props = defineProps<{
  metric: TrendMetricId
  options: ISOCountryCode[]
  answer: ISOCountryCode
  picked?: ISOCountryCode
}>()

const candidates = computed(() =>
  props.options.map(isoCode => ({
    isoCode,
    series: TRENDS[isoCode]?.[props.metric],
    isAnswer: isoCode === props.answer,
    pickedMark: isoCode === props.picked,
    missed: isoCode === props.picked && isoCode !== props.answer,
  }))
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

// Four curves need more room than one line of prose, so this reveal asks for its
// own width rather than having the host reach in through :deep(). Stays inside
// the verdict card's own cap, which is the only other authority on this box.
.trajectory-reveal {
  display: block;
  text-align: left;
  width: min(56rem, 100%);
  margin: 0.8rem auto 0;
}

// Four abreast on desktop, 2×2 once the lesson body narrows — a four-column
// row of curves turns to slivers on a phone.
.candidates {
  gap: 0.7rem;
  display: grid;
  grid-template-columns: repeat(4, 1fr);

  @media (max-width: $tablet) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.candidate {
  gap: 0.4rem;
  display: flex;
  min-width: 0;
  padding: 0.6rem 0.7rem;
  border-radius: 1.2rem;
  flex-flow: column nowrap;
  background: glass(0.55);
  border: 0.1rem solid ink(0.1);
  // The rows land in sequence, picking the ring's turn back up where it left off.
  animation: row-land var(--motion-base) var(--ease-out-expressive) both;
  animation-delay: calc(var(--i, 0) * 70ms);

  &:not(.answer) {
    opacity: 0.72;
  }

  &.answer {
    opacity: 1;
    border-color: hsla(170.5, 34.7%, 45%, 0.7);
    background: hsla(170.5, 34.7%, 55.1%, 0.14);
  }

  &.missed {
    opacity: 1;
    border-color: var(--hior-ange);
    background: flame(0.18);
  }
}

// The pick marker wraps under the name rather than squeezing it — four columns
// leave a long country name no room to share its row.
.candidate-id {
  gap: 0.2rem 0.5rem;
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
  align-items: center;
}

.candidate-flag {
  width: 2.2rem;
  height: 1.5rem;
  flex-shrink: 0;
  border-radius: 0.2rem;
  border: 0.1rem solid ink(0.25);
}

.candidate-name {
  min-width: 0;
  font-size: 1.3rem;
  font-weight: 600;
  line-height: 1.2;
  color: var(--dark-blue);
}

.candidate-picked {
  flex-shrink: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--dark-blue);
  opacity: 0.7;
}

@media (prefers-reduced-motion: reduce) {
  .candidate {
    animation: none;
  }
}
</style>
