<template>
  <div v-if="challenge" class="flag-palette challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Flag Palette`"
      title="Whose flag is this?"
      stakes="Only the colours — no flag. Name the country before the clock runs out. The sooner you name it, the more it's worth."
      @done="start"
    />

    <!-- From the final two-thirds: the flag sketches itself across the whole
         background in ink lines — no fills, just its bones — finishing
         exactly as the clock does -->
    <FlagSketch
      v-if="sketchStarted && sketchMarkup && sketchSeconds"
      :flag="sketchMarkup"
      :draw-seconds="sketchSeconds"
    />
    <ChallengePrompt :hint="hint" :hint-tone="hintTone" :attributions="promptSources">
      <h1 class="map-caption">Whose flag has these colours?</h1>
      <span v-if="regionRevealed && challenge.region" class="map-caption region-hint">
        Region: {{ challenge.region }}
      </span>
    </ChallengePrompt>

    <section class="stage">
      <div class="swatches" aria-hidden="true">
        <span
          v-for="(color, index) in challenge.swatches"
          :key="index"
          class="swatch"
          :style="{ background: color }"
        />
      </div>

      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
    </section>

    <footer class="suggest-berth">
      <!-- This mode's lower edge belongs to the guess box, so the round
           clock lives inside the console pill instead of the corner berth. -->
      <ChallengeConsole class="console" :value="secondsLeft" :total="challenge.durationSeconds">
        <CountryGuessInput
          ref="guessInput"
          :disabled="submitted || !started"
          placeholder="Name the country…"
          @guess="onGuess"
          @miss="announce({ hint: 'No country by that name' })"
        />
      </ChallengeConsole>
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import FlagSketch from '~/components/challenge/FlagSketch.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { attributionFor } from '~~/lib/attribution'
import { isFlagPaletteMatch } from '~~/lib/challenges'
import { countryName, flagMarkup, loadFlags } from '~~/lib/country'
import { buzzScore } from '~~/lib/scoring'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { Country } from '~~/types/geography.types'

const promptSources = [attributionFor('flag')]

const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  remainingFraction,
  begin,
  hint,
  hintTone,
  announce,
  entries,
  submitOnce,
  gameStore,
} = useGroupChallenge('flag-palette-challenge')

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

// Staged hints: the region at half-time (non-hard only — the dealer omits
// `region` on hard), and from the final two-thirds the flag sketches itself
// across the background, completing with the clock — every difficulty gets
// the sketch. Answering early stays worth more.
const clockFraction = remainingFraction
const regionRevealed = computed(() => clockFraction.value <= 1 / 2)
const sketchStarted = computed(() => clockFraction.value <= 2 / 3 && !submitted.value)

// The sketch needs the raw markup, lazy-loaded — the room page warms it at
// join, this is the belt-and-braces retry for a cold or once-failed load.
const flagsReady = ref(false)
loadFlags().then(() => {
  flagsReady.value = true
})
const sketchMarkup = computed(() =>
  flagsReady.value && challenge.value ? flagMarkup(challenge.value.country) : null
)

// The sketch finishes with the clock HOWEVER late it starts: if the markup
// arrives after the sketch beat opened, drawing the full two-thirds span
// would tear down mid-animation — clamp to the clock actually left.
const sketchSeconds = ref<number>()
watch(
  [sketchStarted, sketchMarkup],
  ([started, markup]) => {
    if (!started || !markup || sketchSeconds.value !== undefined) return
    const fullDraw = ((challenge.value?.durationSeconds ?? 30) * 2) / 3
    sketchSeconds.value = Math.min(fullDraw, secondsLeft.value)
  },
  { immediate: true }
)

const submitRound = (correct: boolean, guessed?: Country['isoCode']) => {
  if (submitted.value) return
  const active = challenge.value
  gameStore.map.status = correct ? 'correct' : undefined
  // Name it sooner, keep more of the pot.
  const score = correct && active ? buzzScore(active.maximumPoints, remainingFraction.value) : 0
  submitOnce(correct && active ? [guessed ?? active.country] : [], score)
}

const start = () => {
  begin({ onTimeout: () => submitRound(false) })
  nextTick(() => guessInput.value?.focus({ auto: true }))
}

const onGuess = (country: Country) => {
  const active = challenge.value
  if (!active || submitted.value || !started.value) return

  // The winning guess is never broadcast — it would hand opponents the answer.
  // Palette twins count: the shared verdict accepts any exact colour match.
  if (isFlagPaletteMatch(active, country.isoCode)) {
    submitRound(true, country.isoCode)
  } else {
    announce({
      kind: 'wrong',
      isoCode: country.isoCode,
      hint: `${countryName(country)} — not it`,
      tone: 'alert',
    })
  }
}

// A wrong typed guess doesn't end the round — players keep trying until they
// get it or the clock runs out; only the first correct guess scores.
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/ink' as *;
@use '~/assets/scss/rules/breakpoints' as *;

header .region-hint {
  padding: 0.4rem 1.4rem;
  color: var(--soft-blue);
  font-weight: 600;
}

// Below the header's own z-index 2: the miss hint floats out of the header's
// bottom edge and over the swatch frame. Still above the FlagSketch backdrop,
// which is unstacked.
.stage {
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
}

.swatches {
  display: flex;
  gap: 1.2rem;
  padding: 1.4rem;
  flex-wrap: wrap;
  justify-content: center;
  // Six swatches must fit a 360px screen inside the frame's own padding.
  max-width: calc(100vw - 3.2rem);
  border-radius: 1.4rem;
  background: milk(0.85);
  border: 0.1rem solid ink(0.2);
}

.swatch {
  width: min(8rem, 11vw);
  height: min(8rem, 11vw);
  border-radius: 1rem;
  box-shadow: inset 0 0 0 1px ink(0.15);
}

footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;
}
</style>
