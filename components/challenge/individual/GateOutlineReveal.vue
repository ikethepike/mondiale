<template>
  <h1 class="map-caption">Whose border is drawing itself?</h1>
  <span class="map-caption sub">{{ subCopy }}</span>
  <svg v-if="outline" class="reveal-outline" :viewBox="outline.viewBox" aria-hidden="true">
    <path ref="outlinePath" :d="outline.d" :stroke-width="outline.strokeWidth" />
  </svg>

  <Teleport v-if="footerReady" to="#gate-footer">
    <div class="guess-box">
      <CountryGuessInput placeholder="Type the country — one shot" @guess="onGuess" />
    </div>
  </Teleport>
</template>
<script lang="ts" setup>
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { useGateChallenge, useGateClock } from '~~/lib/use-gate-challenge'
import { useOutlineReveal } from '~~/lib/useOutlineReveal'
import { OUTLINE_REVEAL_SECONDS } from '~~/lib/gate-timing'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { Country } from '~~/types/geography.types'

const props = defineProps<{ challenge: IndividualChallenge }>()

const { gameStore } = useClientEvents()
const { status, showInterstitial, submitAnswer, giveUp } = useGateChallenge()

// Preview flash → sweep-away → clock-synced border draw, all size-relative.
const {
  outline,
  outlinePath,
  phase,
  prepareOutline,
  beginOutlineReveal: beginOutlineDraw,
  tickOutlineReveal,
  resetOutlineReveal,
} = useOutlineReveal()

// The server's window already holds the clock behind the interstitial and the
// preview's lead, so the geometry chunk never burns answer time.
const { secondsLeft, stop } = useGateClock({
  onTick: left => tickOutlineReveal(left),
  onExpire: () => {
    gameStore.map.solo = false
    giveUp()
  },
})
const footerReady = ref(false)

// The world map is a giveaway for a shape mystery.
onMounted(() => {
  gameStore.map.solo = true
  footerReady.value = true
})

// The preview is armed once per gate. completeAt 1: in this race the closing
// line IS the deadline.
let armed = false
watch(
  showInterstitial,
  value => {
    if (value || armed) return
    armed = true
    prepareOutline(props.challenge.country)
    void beginOutlineDraw(OUTLINE_REVEAL_SECONDS, 1)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  resetOutlineReveal()
})

const subCopy = computed(() => {
  switch (phase.value) {
    case 'preview':
    case 'sweep':
      return 'Memorize it — it unravels in a moment'
    case 'static':
      return `${secondsLeft.value}s — the whole border, one shot`
    case 'drawing':
      return `${secondsLeft.value}s — name it before the line closes`
    default:
      return `${secondsLeft.value}s — name the country`
  }
})

const onGuess = (country: Country) => {
  if (status.value) return
  stop()
  // One shot: right or wrong, this is the answer — the server validates.
  // Bring the world back so the result zoom has a map to land on.
  gameStore.map.solo = false
  submitAnswer(country.isoCode)
}
</script>
<style lang="scss" scoped>
// The self-drawing border race
.reveal-outline {
  height: 38vh;
  max-width: 62vw;
  margin-top: 0.6rem;

  // Stroke width arrives as a user-unit attribute scaled to the country's
  // frame — non-scaling-stroke would shatter the dash-reveal (see outline.ts).
  path {
    fill: none;
    stroke: var(--dark-blue);
    stroke-linejoin: round;
    stroke-linecap: round;
  }
}
</style>
