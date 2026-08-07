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
import { wait } from '~~/lib/time'
import { useGateChallenge } from '~~/lib/use-gate-challenge'
import { useOutlineReveal } from '~~/lib/useOutlineReveal'
import { OUTLINE_REVEAL_SECONDS } from './timing'
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

const secondsLeft = ref(OUTLINE_REVEAL_SECONDS)
const footerReady = ref(false)
let timer: ReturnType<typeof setInterval> | undefined
/** Flipped on unmount so a held clock-start can't arm a dead round. */
let alive = true
/** Cap on holding the clock for the geometry chunk — bounded dead air. */
const CLOCK_HOLD_MS = 3000

// The world map is a giveaway for a shape mystery.
onMounted(() => {
  gameStore.map.solo = true
  footerReady.value = true
})

watch(
  showInterstitial,
  value => {
    if (value || timer) return
    prepareOutline(props.challenge.country)

    // Hold the clock until the preview is armed — the geometry chunk mustn't
    // burn answer time — but never past the cap: the gate must not hang
    // without its timeout just because the geometry was slow or missing.
    // completeAt 1: in this race the closing line IS the deadline.
    Promise.race([beginOutlineDraw(OUTLINE_REVEAL_SECONDS, 1), wait(CLOCK_HOLD_MS)]).then(() => {
      if (!alive || timer || status.value) return
      timer = setInterval(() => {
        secondsLeft.value--
        tickOutlineReveal(secondsLeft.value)
        if (secondsLeft.value > 0) return
        clearInterval(timer)
        if (status.value) return
        gameStore.map.solo = false
        giveUp()
      }, 1000)
    })
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  alive = false
  if (timer) clearInterval(timer)
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
  if (timer) clearInterval(timer)
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
