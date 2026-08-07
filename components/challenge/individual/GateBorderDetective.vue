<template>
  <template v-if="challenge.neighbours">
    <h1 class="map-caption">Who sits in the middle?</h1>
    <span class="map-caption sub">Name the country these neighbours all border</span>
    <ChallengeTimerRadial
      class="gate-clock"
      :value="secondsLeft"
      :total="BORDER_DETECTIVE_SECONDS"
    />
    <div class="border-ring" :style="{ '--ring-count': challenge.neighbours.length }">
      <div class="ring-center" aria-hidden="true">
        <span v-if="isoHint" class="iso-chip">{{ isoHint }}</span>
        <svg v-if="outlineHint" class="hint-outline" :viewBox="outlineHint.viewBox">
          <path :d="outlineHint.d" />
        </svg>
        <template v-else>?</template>
      </div>
      <div
        v-for="(neighbour, index) in challenge.neighbours"
        :key="neighbour"
        class="ring-flag"
        :class="{ named: !isHard }"
        :style="ringSlot(index, challenge.neighbours.length)"
      >
        <CountryFlag :country="getCountry(neighbour)" mode="inline" />
        <span v-if="!isHard" class="ring-name">{{ countryName(neighbour) }}</span>
      </div>
    </div>
    <div class="hint-row">
      <Transition name="caption">
        <button
          v-if="!outlineHint && outlineHintUnlocked"
          class="hint-button"
          type="button"
          @click="showOutlineHint"
        >
          <StatTopicIcon class="hint-icon" topic="reveal" />
          Outline (−{{ GATE_HINT_BITE_STEPS }} from the pot)
        </button>
      </Transition>
      <Transition name="caption">
        <button
          v-if="!isoHint && isoHintUnlocked"
          class="hint-button"
          type="button"
          @click="showIsoHint"
        >
          <StatTopicIcon class="hint-icon" topic="question" />
          Country code (−{{ GATE_HINT_BITE_STEPS }} from the pot)
        </button>
      </Transition>
    </div>

    <!-- The typed console stands in the shell's footer per the layer contract:
         mid-column it falls under the software keyboard and iOS chases the
         caret on every keystroke. -->
    <Teleport v-if="footerReady" to="#gate-footer">
      <div class="guess-box">
        <CountryGuessInput placeholder="Type the country in the middle" @guess="onGuess" />
      </div>
    </Teleport>
  </template>
</template>
<script lang="ts" setup>
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import StatTopicIcon from '~/components/challenge/StatTopicIcon.vue'
import CountryFlag from '~/components/country/CountryFlag.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import { countryName, getCountry } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { mainlandOutline } from '~~/lib/outline'
import {
  GATE_HINT_BITE_STEPS,
  HINT_UNLOCK_FIRST_ELAPSED,
  HINT_UNLOCK_SECOND_ELAPSED,
} from '~~/lib/scoring'
import { useGateChallenge } from '~~/lib/use-gate-challenge'
import { ringSlot } from './ring'
// Timed like the other mystery gates: the clock scales the leap (buzz curve,
// applied server-side from the reported fraction) and runs out into a miss.
import { BORDER_DETECTIVE_SECONDS } from './timing'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

const props = defineProps<{ challenge: IndividualChallenge }>()

const { gameStore } = useClientEvents()
const { status, isHard, showInterstitial, submitAnswer, giveUp } = useGateChallenge()

const secondsLeft = ref(BORDER_DETECTIVE_SECONDS)
let timer: ReturnType<typeof setInterval> | undefined
/** The bought outline hint, drawn in the ring's centre. Every hint bites steps. */
const outlineHint = ref<Awaited<ReturnType<typeof mainlandOutline>>>()
let outlineHintLoading = false
/** The bought last-resort hint: the country's ISO code, chipped onto the ring. */
const isoHint = ref<ISOCountryCode>()
const footerReady = ref(false)

const elapsedFraction = computed(() => 1 - secondsLeft.value / BORDER_DETECTIVE_SECONDS)
const outlineHintUnlocked = computed(() => elapsedFraction.value >= HINT_UNLOCK_FIRST_ELAPSED)
const isoHintUnlocked = computed(() => elapsedFraction.value >= HINT_UNLOCK_SECOND_ELAPSED)
const hintsUsed = computed(() => (outlineHint.value ? 1 : 0) + (isoHint.value ? 1 : 0))

// The world map is a giveaway for a neighbour mystery — blank it while the
// question stands. The shell's clearBoard restores it for the next gate.
onMounted(() => {
  gameStore.map.solo = true
  footerReady.value = true
})

// The race starts the moment the interstitial clears.
watch(
  showInterstitial,
  value => {
    if (value || timer) return
    timer = setInterval(() => {
      secondsLeft.value--
      if (secondsLeft.value > 0) return
      clearInterval(timer)
      if (status.value) return
      gameStore.map.solo = false
      giveUp()
    }, 1000)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const showOutlineHint = async () => {
  if (outlineHint.value || outlineHintLoading || status.value) return
  outlineHintLoading = true
  try {
    // The outline loads the HD geometry chunk — only count (and charge) the
    // hint once a frame actually lands, and never after the gate resolved.
    const frame = await mainlandOutline(props.challenge.country)
    if (frame && !status.value) outlineHint.value = frame
  } finally {
    outlineHintLoading = false
  }
}

const showIsoHint = () => {
  if (isoHint.value || status.value) return
  isoHint.value = props.challenge.country
}

const onGuess = (country: Country) => {
  if (status.value) return
  if (timer) clearInterval(timer)
  // Bring the world back so the result zoom has a map to land on.
  gameStore.map.solo = false
  submitAnswer(country.isoCode, {
    remainingFraction: Math.max(0, secondsLeft.value) / BORDER_DETECTIVE_SECONDS,
    hintsUsed: hintsUsed.value,
  })
}
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;

// The bought hint: the mystery country's outline takes over the "?" circle.
.ring-center .hint-outline {
  width: 76%;
  height: 76%;

  path {
    fill: none;
    stroke: var(--dark-blue);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
}

// The bought last resort: the ISO code chipped over the circle's top edge.
.ring-center .iso-chip {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -55%);
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  padding: 0.2rem 0.9rem 0.2rem 1.08rem; // optical: balance the tracking's tail
  border-radius: 1rem;
  color: var(--dark-blue);
  background: milk(0.92);
  border: 0.1rem solid ink(0.3);
}
</style>
