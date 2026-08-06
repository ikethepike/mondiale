<template>
  <template v-if="challenge.trajectory">
    <h1 class="map-caption">Whose chart is this?</h1>
    <span class="map-caption sub">One of these countries' {{ metricLabel }}</span>
    <ChallengeTimerRadial
      class="gate-clock"
      :value="secondsLeft"
      :total="TRAJECTORY_MATCH_SECONDS"
    />
    <div
      class="border-ring trajectory-ring"
      :style="{ '--ring-count': challenge.trajectory.options.length }"
    >
      <div class="ring-center chart-center" aria-hidden="true">
        <TrendSparkline
          v-if="series"
          :series="series"
          :metric="challenge.trajectory.metric"
          :hide-values="!valuesRevealed"
        />
      </div>
      <button
        v-for="(option, index) in challenge.trajectory.options"
        :key="option"
        class="ring-flag ring-pick"
        :class="{ struck: struck.has(option) }"
        type="button"
        :disabled="struck.has(option)"
        :style="ringSlot(index, challenge.trajectory.options.length)"
        @click="onPick(option)"
      >
        <CountryFlag :country="getCountry(option)" mode="inline" />
        <span v-if="!isHard" class="ring-name">{{ countryName(option) }}</span>
      </button>
    </div>
    <div class="hint-row">
      <Transition name="caption">
        <button
          v-if="!struck.size && strikeHintUnlocked"
          class="hint-button"
          type="button"
          @click="showStrikeHint"
        >
          <StatTopicIcon class="hint-icon" topic="reveal" />
          Strike out half (−{{ GATE_HINT_BITE_STEPS }} steps)
        </button>
      </Transition>
    </div>
  </template>
</template>
<script lang="ts" setup>
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import TrendSparkline from '~/components/challenge/TrendSparkline.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import { shuffleArray } from '~~/lib/arrays'
import { countryName, getCountry } from '~~/lib/country'
import { GATE_HINT_BITE_STEPS, HINT_UNLOCK_FIRST_ELAPSED } from '~~/lib/scoring'
import { TREND_METRICS } from '~~/lib/trends'
import { TRENDS } from '~~/lib/trends-data'
import { useGateChallenge, wrongTokenFor } from '~~/lib/use-gate-challenge'
import { ringSlot } from './ring'
import { TRAJECTORY_MATCH_SECONDS } from './timing'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { ISOCountryCode } from '~~/types/geography.types'

const props = defineProps<{ challenge: IndividualChallenge }>()

/** Non-hard games get the y-axis values free in the final third. */
const VALUES_REVEAL_ELAPSED = 2 / 3

const { status, isHard, showInterstitial, submitAnswer } = useGateChallenge()

const secondsLeft = ref(TRAJECTORY_MATCH_SECONDS)
const struck = ref(new Set<ISOCountryCode>())
let timer: ReturnType<typeof setInterval> | undefined

const elapsed = computed(() => 1 - secondsLeft.value / TRAJECTORY_MATCH_SECONDS)
const strikeHintUnlocked = computed(() => elapsed.value >= HINT_UNLOCK_FIRST_ELAPSED)
const metricLabel = computed(() =>
  props.challenge.trajectory ? TREND_METRICS[props.challenge.trajectory.metric].label : ''
)
const series = computed(() =>
  props.challenge.trajectory
    ? TRENDS[props.challenge.country]?.[props.challenge.trajectory.metric]
    : undefined
)
const valuesRevealed = computed(() => {
  const trajectory = props.challenge.trajectory
  if (!trajectory) return false
  // Result beat always shows values; during play hard mode stays shape-only.
  if (status.value) return true
  return trajectory.valuesHint && elapsed.value >= VALUES_REVEAL_ELAPSED
})

watch(
  showInterstitial,
  value => {
    if (value || timer) return
    timer = setInterval(() => {
      secondsLeft.value--
      if (secondsLeft.value > 0) return
      clearInterval(timer)
      if (!status.value) submitAnswer(wrongTokenFor(props.challenge.country))
    }, 1000)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const showStrikeHint = () => {
  const trajectory = props.challenge.trajectory
  if (!trajectory || struck.value.size || status.value) return
  const decoys = shuffleArray(
    trajectory.options.filter(option => option !== props.challenge.country)
  )
  struck.value = new Set(decoys.slice(0, Math.ceil(decoys.length / 2)))
}

const onPick = (isoCode: ISOCountryCode) => {
  if (status.value || struck.value.has(isoCode)) return
  if (timer) clearInterval(timer)
  submitAnswer(isoCode, {
    remainingFraction: Math.max(0, secondsLeft.value) / TRAJECTORY_MATCH_SECONDS,
    hintsUsed: struck.value.size ? 1 : 0,
  })
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

// The mystery chart sits where Border Detective keeps its "?", with the
// candidate flags clickable around it.
.trajectory-ring {
  pointer-events: auto;

  .chart-center {
    width: 52%;
    font-size: inherit;
    border-radius: 1.2rem;
    aspect-ratio: auto;
    padding: 1rem 1.2rem 0.6rem;
    pointer-events: none;
  }
}

.ring-pick {
  border: 0;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  background: none;
  transition: opacity var(--motion-quick) var(--ease-out-expressive);

  @media (hover: hover) {
    &:hover:not(:disabled) :deep(svg) {
      filter: drop-shadow(0 2px 5px ink(0.4));
    }
  }

  &.struck {
    opacity: 0.25;
    cursor: default;
    text-decoration: line-through;
  }
}
</style>
