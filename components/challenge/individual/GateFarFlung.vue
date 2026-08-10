<template>
  <template v-if="entry">
    <h1 class="map-caption">This is a far-flung piece of one country</h1>
    <span class="map-caption sub">Name it — the longer you wait, the more world you'll see.</span>
    <ChallengeTimerRadial class="gate-clock" :value="secondsLeft" :total="FAR_FLUNG_SECONDS" />

    <!-- Both consoles stand in the shell footer: its berth keeps the camera's
         subject band CLEAR — a centre-floating card grid sat exactly on top
         of the fragment being asked about. -->
    <Teleport v-if="footerReady" to="#gate-footer">
      <div v-if="challenge.options" class="footer-options card-options">
        <button
          v-for="option in challenge.options"
          :key="option"
          class="card-option"
          type="button"
          @click="onPick(option)"
        >
          <CountryTileFlag class="option-flag" :country="getCountry(option)" />
          <span>{{ countryName(option) }}</span>
        </button>
      </div>
      <div v-else class="guess-box">
        <CountryGuessInput placeholder="Type the country it belongs to" @guess="onGuess" />
      </div>
    </Teleport>
  </template>
</template>
<script lang="ts" setup>
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import CountryTileFlag from '~/components/country/CountryTileFlag.vue'
import { FAR_FLUNG } from '~~/data/far-flung.gen'
import { countryName, getCountry } from '~~/lib/country'
import { useClientEvents } from '~~/lib/events/client-side'
import { useGateChallenge, useGateClock } from '~~/lib/use-gate-challenge'
import { FAR_FLUNG_SECONDS } from './timing'
import type { IndividualChallenge } from '~~/types/challenges/individual-challenge.type'
import type { Country, ISOCountryCode } from '~~/types/geography.types'

const props = defineProps<{ challenge: IndividualChallenge }>()

const { gameStore } = useClientEvents()
const { status, showInterstitial, submitAnswer, giveUp } = useGateChallenge()

const entry = computed(() => {
  const slug = props.challenge.farFlung?.slug
  return slug ? FAR_FLUNG[slug] : undefined
})

const footerReady = ref(false)
onMounted(() => {
  footerReady.value = true
})

const { secondsLeft, remainingFraction, stop } = useGateClock(FAR_FLUNG_SECONDS, {
  // Clear the pull-out BEFORE the miss lands: the clock and the camera tween
  // end in the same beat, and a still-armed zoomOut holds the camera lock the
  // result fly-to needs (the release order the zoomOut watcher documents).
  onExpire: () => {
    gameStore.map.zoomOut = undefined
    giveUp()
  },
})

// The stage: ONLY the fragment is painted (a warm land overlay — no owner
// highlight, no labels: any of those answers the question), and the camera
// opens on its frame, easing out to the neighbourhood over the clock. Both
// riders start when the briefing clears, like the zoom-out gate's reveal.
watch(
  showInterstitial,
  briefing => {
    if (briefing || !entry.value) return
    gameStore.map.feature = { d: entry.value.d, kind: 'land' }
    gameStore.map.zoomOut = {
      isoCode: props.challenge.country,
      durationSeconds: FAR_FLUNG_SECONDS,
      box: entry.value.bounds,
    }
  },
  { immediate: true }
)

// Stop the pull-out; the result fly-to takes the camera. The land overlay
// deliberately STAYS — the reveal frames the whole owner with the fragment
// still lit, which is the "oh, it's THERE" beat.
const resolve = (isoCode: ISOCountryCode) => {
  if (status.value) return
  stop()
  gameStore.map.zoomOut = undefined
  submitAnswer(isoCode, { remainingFraction: remainingFraction.value })
}
const onGuess = (country: Country) => resolve(country.isoCode)
const onPick = (isoCode: ISOCountryCode) => resolve(isoCode)
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

// A console STRIP, not a stage grid: four compact cards across the footer
// band, so the subject keeps the whole camera frame above.
.footer-options {
  gap: 1rem;
  margin: 0 auto;
  max-width: 72rem;
  pointer-events: auto;
  grid-template-columns: repeat(4, minmax(0, 1fr));

  :deep(.option-flag) {
    max-height: 6rem;
  }

  .card-option {
    gap: 0.6rem;
    padding: 0.8rem;
    font-size: 1.4rem;
  }
}

@media (max-width: $tablet) {
  .footer-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
