<template>
  <h1 class="map-caption">Name it before the map zooms out</h1>
  <span class="map-caption sub">The longer you wait, the more you'll see.</span>

  <Teleport v-if="footerReady" to="#gate-footer">
    <div class="guess-box">
      <CountryGuessInput placeholder="Type the country you recognise" @guess="onGuess" />
    </div>
  </Teleport>
</template>
<script lang="ts" setup>
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import { useClientEvents } from '~~/lib/events/client-side'
import { useGateChallenge, useGateClock } from '~~/lib/use-gate-challenge'
import { ZOOM_OUT_SECONDS } from '~~/lib/gate-timing'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { Country } from '~~/types/geography.types'

const props = defineProps<{ challenge: IndividualChallenge }>()

const { gameStore } = useClientEvents()
const { status, showInterstitial, submitAnswer, giveUp } = useGateChallenge()

const footerReady = ref(false)
// The window is the server's: the full zoom plus a last-guess grace.
useGateClock({ onExpire: () => giveUp() })

onMounted(() => {
  footerReady.value = true
})

watch(
  showInterstitial,
  value => {
    if (value || gameStore.map.zoomOut) return
    gameStore.map.zoomOut = {
      isoCode: props.challenge.country,
      durationSeconds: ZOOM_OUT_SECONDS,
    }
  },
  { immediate: true }
)

const onGuess = (country: Country) => {
  if (status.value) return
  gameStore.map.zoomOut = undefined // stop the reveal; the result zoom takes over
  submitAnswer(country.isoCode)
}
</script>
