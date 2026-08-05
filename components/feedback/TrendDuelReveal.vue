<template>
  <div class="trend-duel-reveal">
    <ol class="duels">
      <li v-for="(row, index) in rows" :key="index" class="duel">
        <span class="duel-head">
          {{ row.label }} — {{ row.answerName }} is the one {{ row.seek }}
        </span>
        <span class="sides">
          <span
            v-for="side in row.sides"
            :key="side.isoCode"
            class="side"
            :class="{ answer: side.isAnswer, missed: side.missed }"
          >
            <span class="side-id">
              <CountryFlag
                class="side-flag"
                :country="getCountry(side.isoCode)"
                mode="background"
              />
              <span class="side-name">{{ countryName(side.isoCode) }}</span>
              <span v-if="side.pickedMark" class="side-picked">your pick</span>
            </span>
            <TrendSparkline
              v-if="side.series"
              :series="side.series"
              :metric="row.metric"
              detail="chart"
            />
          </span>
        </span>
      </li>
    </ol>
  </div>
</template>
<script lang="ts" setup>
import TrendSparkline from '~/components/challenge/TrendSparkline.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import { countryName, getCountry } from '~~/lib/country'
import { TREND_METRICS } from '~~/lib/trends'
import { TRENDS } from '~~/lib/trends-data'
import type { TrendDuelOutcome } from '~~/types/challenges/individual-challenge.type'

/**
 * The trend-duel gate's ledger: every duel faced, both series side by side —
 * DuelReveal's shape for trends. Renders inside ChallengeResult's lesson
 * paragraph, so spans throughout.
 */
const props = defineProps<{
  outcomes: TrendDuelOutcome[]
}>()

const rows = computed(() =>
  props.outcomes.map(outcome => ({
    metric: outcome.metric,
    label: TREND_METRICS[outcome.metric].label,
    seek: outcome.seek,
    answerName: countryName(outcome.answer),
    sides: [outcome.answer, outcome.other].map(isoCode => ({
      isoCode,
      series: TRENDS[isoCode]?.[outcome.metric],
      isAnswer: isoCode === outcome.answer,
      pickedMark: isoCode === outcome.picked,
      missed: !outcome.correct && isoCode === outcome.picked,
    })),
  }))
)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

.trend-duel-reveal {
  gap: 0.8rem;
  display: flex;
  text-align: left;
  flex-flow: column nowrap;
}

.duels {
  gap: 0.7rem;
  margin: 0;
  padding: 0;
  display: grid;
  list-style: none;
}

.duel {
  gap: 0.6rem;
  display: flex;
  padding: 0.7rem 1rem;
  border-radius: 1.2rem;
  flex-flow: column nowrap;
  background: glass(0.55);
  border: 1px solid ink(0.1);
}

.duel-head {
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--dark-blue);
}

.sides {
  gap: 1rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.side {
  gap: 0.4rem;
  display: flex;
  min-width: 0;
  flex-flow: column nowrap;

  &:not(.answer) {
    opacity: 0.7;
  }

  &.missed {
    opacity: 1;

    .side-name,
    .side-picked {
      color: var(--hior-ange);
    }
  }
}

.side-id {
  gap: 0.6rem;
  display: flex;
  align-items: center;
}

.side-flag {
  flex: 0 0 auto;
  width: 2.2rem;
  height: 1.5rem;
  border-radius: 0.3rem;
  box-shadow: 0 0 0 1px ink(0.12);
}

.side-name {
  font-size: 1.3rem;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.side-picked {
  font-size: 1.05rem;
  flex-shrink: 0;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--soft-blue);
}

.trend-duel-reveal .source-line {
  justify-content: center;
}

@media (max-width: $tablet) {
  .sides {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
