<template>
  <template v-if="currentDuel">
    <h1 class="map-caption">Whose {{ metricLabel }} is {{ currentDuel.seek }}?</h1>
    <span class="map-caption sub">Duel {{ index + 1 }} of {{ total }} — win them all</span>
    <div class="gate-options card-options">
      <button
        v-for="option in [currentDuel.a, currentDuel.b]"
        :key="`${currentDuel.metric}-${option}`"
        class="card-option trend-option"
        :class="cardClass(option)"
        type="button"
        :disabled="!!reveal"
        @click="answerDuel(option)"
      >
        <CountryTileFlag class="option-flag" :country="getCountry(option)" />
        <span>{{ countryName(option) }}</span>
        <TrendSparkline
          v-if="reveal && seriesFor(option, currentDuel.metric)"
          :series="seriesFor(option, currentDuel.metric)!"
          :metric="currentDuel.metric"
          animate-in
        />
      </button>
    </div>
  </template>
</template>
<script lang="ts" setup>
import TrendSparkline from '~/components/challenge/TrendSparkline.vue'
import CountryTileFlag from '~/components/country/CountryTileFlag.vue'
import { countryName, getCountry } from '~~/lib/country'
import { readTrend, TREND_METRICS, type TrendMetricId } from '~~/lib/trends'
import { TRENDS } from '~~/lib/trends-data'
import { useGateChallenge } from '~~/lib/use-gate-challenge'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

const props = defineProps<{ challenge: IndividualChallenge }>()

/** Higher-lower's trust model with a pow-reveal beat: pick a flag, both cards
 *  flip to sparklines, hold, then the next pair slides in (or the gate
 *  resolves). */
const REVEAL_MS = 3200

const { status, missNote, trendDuelOutcomes, submitAnswer } = useGateChallenge()

const index = ref(0)
const reveal = ref<{ picked: ISOCountryCode; correct: boolean }>()
let revealTimer: ReturnType<typeof setTimeout> | undefined

const total = computed(() => props.challenge.trendDuels?.length ?? 0)
const currentDuel = computed(() => props.challenge.trendDuels?.[index.value])
const metricLabel = computed(() =>
  currentDuel.value ? TREND_METRICS[currentDuel.value.metric].label : ''
)

const seriesFor = (isoCode: ISOCountryCode, metric: TrendMetricId) => TRENDS[isoCode]?.[metric]

const cardClass = (option: ISOCountryCode) => {
  if (!reveal.value || option !== reveal.value.picked) return undefined
  return reveal.value.correct ? 'was-right' : 'was-wrong'
}

onBeforeUnmount(() => {
  if (revealTimer) clearTimeout(revealTimer)
})

const answerDuel = (picked: ISOCountryCode) => {
  const duel = currentDuel.value
  if (!duel || status.value || reveal.value) return

  const direction = readTrend(seriesFor(picked, duel.metric), duel.metric)?.direction
  const correct = direction === duel.seek
  reveal.value = { picked, correct }

  const unpicked = picked === duel.a ? duel.b : duel.a
  trendDuelOutcomes.value.push({
    metric: duel.metric,
    seek: duel.seek,
    picked,
    answer: correct ? picked : unpicked,
    other: correct ? unpicked : picked,
    correct,
  })

  revealTimer = setTimeout(() => {
    reveal.value = undefined
    if (!correct) {
      missNote.value = `${countryName(unpicked)} is the one ${duel.seek}`
      // Any lost duel fails the challenge: submit a token that can't match
      const wrongToken = props.challenge.country === picked ? unpicked : picked
      return submitAnswer(wrongToken, { reveal: false })
    }
    if (index.value >= total.value - 1) {
      // Swept the whole streak — submit the winning token
      return submitAnswer(props.challenge.country, { reveal: false })
    }
    index.value++
  }, REVEAL_MS)
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

// The pow reveal flips both cards to sparklines; the picked card carries the
// verdict wash.
.trend-option {
  .trend-sparkline {
    width: 100%;
    margin-top: 0.4rem;
  }
  // The pow reveal disables both cards for its hold — no disabled fade.
  &:disabled {
    opacity: 1;
  }
  &.was-right {
    border-color: hsla(170.5, 34.7%, 45%, 0.7);
    background: hsla(170.5, 34.7%, 55.1%, 0.14);
  }
  &.was-wrong {
    border-color: var(--hior-ange);
    background: flame(0.18);
  }
}
</style>
