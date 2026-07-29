<template>
  <div v-if="challenge" class="water-blitz challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — ${copy.kicker}`"
      :title="copy.title"
      :stakes="`${challenge.countries.length} countries — name as many as you can in ${challenge.durationSeconds} seconds. Wrong names cost points.`"
      @done="begin"
    />

    <ChallengePrompt :hint="hint">
      <h1 class="map-caption">{{ copy.title }}</h1>
      <span class="map-caption sub">
        {{ found.length }} of {{ challenge.countries.length }} found
      </span>
    </ChallengePrompt>

    <footer class="suggest-berth">
      <div class="guess-box">
        <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
        <!-- The round clock lives inside the console pill — this mode's lower
             half belongs to the guess box and the found list. -->
        <ChallengeConsole class="console" :value="secondsLeft" :total="challenge.durationSeconds">
          <CountryGuessInput
            ref="guessInput"
            :disabled="submitted || !started"
            :excluded="guesses"
            :placeholder="copy.placeholder"
            @guess="onGuess"
            @miss="announce({ hint: 'No country by that name' })"
          />
        </ChallengeConsole>
      </div>
      <TransitionGroup tag="ol" name="chain" class="country-chip-list">
        <CountryChip
          v-for="isoCode in guesses"
          :key="isoCode"
          class="map-caption"
          :class="{ stray: !answerSet.has(isoCode) }"
          :country="getCountry(isoCode)"
        />
      </TransitionGroup>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import CountryChip from '~/components/country/CountryChip.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
import { useCollectSetRound } from '~~/lib/use-collect-set-round'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'

// Full world map with the feature drawn on top; guesses tint as they land — so
// this mode opts out of the composable's shapes-only default.
const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  begin: beginRound,
  hint,
  announce,
  entries,
  submitOnce,
  gameStore,
} = useGroupChallenge('water-blitz-challenge', { solo: false })

/** One view, three moods — the feature kind decides the copy. */
const copy = computed(() => {
  const active = challenge.value
  const name = active?.featureName ?? ''
  switch (active?.kind) {
    case 'river':
      return {
        kicker: 'River Run',
        title: `The ${name} flows through which countries?`,
        placeholder: 'Type a country along the river…',
      }
    case 'sea':
    case 'lake':
      return {
        kicker: 'Shared Shores',
        title: `Name every country on the ${name}`,
        placeholder: 'Type a country on this shore…',
      }
    default:
      return {
        kicker: 'Highlands & Basins',
        title: `The ${name} spans which countries?`,
        placeholder: 'Type a country it touches…',
      }
  }
})

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

onMounted(async () => {
  const active = challenge.value
  if (!active) return
  // Geometry lives in its own lazy chunk — only the feature id travelled
  const { WATER_FEATURES } = await import('~~/data/water.gen')
  const feature = WATER_FEATURES[active.featureId]
  if (!feature) return
  gameStore.map.feature = {
    d: feature.d,
    kind: feature.kind === 'river' ? 'line' : 'area',
    bounds: feature.bounds,
  }
})

const {
  guesses,
  answerSet,
  found,
  start: begin,
  onGuess,
} = useCollectSetRound(
  { submitted, started, announce, submitOnce, begin: beginRound, gameStore },
  {
    answers: () => challenge.value?.countries ?? [],
    wrongHint: country => `${countryName(country)} isn't one of them`,
    focusInput: () => guessInput.value?.focus({ auto: true }),
  }
)
</script>
<!-- Chips, list layout and the chain landing all come from shared templates. -->
<style lang="scss" scoped>
// Console over the caught chips, both in the shell footer's berth.
footer {
  gap: 1.2rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
}
</style>
