<template>
  <div v-if="challenge" class="flag-palette">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Flag Palette`"
      title="Whose flag is this?"
      stakes="Only the colours — no flag. Name the country before the clock runs out. The sooner you name it, the more it's worth."
      @done="start"
    />

    <header>
      <div class="prompt">
        <h1 class="map-caption">Whose flag has these colours?</h1>
        <span class="map-caption sub">{{ secondsLeft }}s left</span>
        <span v-if="regionRevealed && challenge.region" class="map-caption region-hint">
          Region: {{ challenge.region }}
        </span>
        <Transition name="caption">
          <span v-if="hint" class="map-caption hint">{{ hint }}</span>
        </Transition>
      </div>
    </header>

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

    <footer>
      <ChallengeTimer :value="secondsLeft" :total="challenge.durationSeconds" />
      <CountryGuessInput
        ref="guessInput"
        :disabled="submitted || !started"
        placeholder="Name the country…"
        @guess="onGuess"
        @miss="announce({ hint: 'No country by that name' })"
      />
    </footer>
  </div>
</template>
<script lang="ts" setup>
import ChallengeTimer from '~/components/challenge/ChallengeTimer.vue'
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName } from '~~/lib/country'
import { buzzFraction } from '~~/lib/scoring'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import type { Country } from '~~/types/geography.types'

const {
  challenge,
  currentRound,
  showInterstitial,
  started,
  submitted,
  secondsLeft,
  begin,
  hint,
  announce,
  entries,
  submitOnce,
  gameStore,
} = useGroupChallenge('flag-palette-challenge')

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

// The region hint (non-hard mode) surfaces only in the final third of the
// clock — a late nudge as time runs out, not a giveaway from the start.
const regionRevealed = computed(() => {
  const total = challenge.value?.durationSeconds ?? 0
  return started.value && total > 0 && secondsLeft.value / total <= 1 / 3
})

const submitRound = (correct: boolean) => {
  if (submitted.value) return
  const active = challenge.value
  gameStore.map.status = correct ? 'correct' : undefined
  // Name it sooner, keep more of the pot.
  const score =
    correct && active
      ? Math.round(active.maximumPoints * buzzFraction(secondsLeft.value / active.durationSeconds))
      : 0
  submitOnce(correct && active ? [active.country] : [], score)
}

const start = () => {
  begin({ onTimeout: () => submitRound(false) })
  nextTick(() => guessInput.value?.focus())
}

const onGuess = (country: Country) => {
  const active = challenge.value
  if (!active || submitted.value || !started.value) return

  // The winning guess is never broadcast — it would hand opponents the answer.
  if (country.isoCode === active.country) {
    submitRound(true)
  } else {
    announce({
      kind: 'wrong',
      isoCode: country.isoCode,
      hint: `${countryName(country)} — not it`,
    })
  }
}

// A wrong typed guess doesn't end the round — players keep trying until they
// get it or the clock runs out; only the first correct guess scores.
</script>
<style lang="scss" scoped>
.flag-palette {
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  display: flex;
  position: absolute;
  flex-flow: column nowrap;
  justify-content: space-between;
}

header {
  z-index: 2;
  width: 100%;
  text-align: center;
  padding: 2rem 4rem;

  h1 {
    margin: 0;
    font-size: 3.2rem;
  }
  .sub,
  .hint {
    padding: 0.4rem 1.4rem;
  }
  .hint {
    color: var(--hior-ange);
  }
  .region-hint {
    padding: 0.4rem 1.4rem;
    color: var(--soft-blue);
    font-weight: 600;
  }
  .prompt {
    gap: 1rem;
    display: flex;
    align-items: center;
    flex-flow: column nowrap;
  }
}

.stage {
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
}

.swatches {
  display: flex;
  gap: 1.2rem;
  padding: 1.4rem;
  border-radius: 1.4rem;
  background: hsla(36, 100%, 98%, 0.85);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.2);
}

.swatch {
  width: min(8rem, 16vw);
  height: min(8rem, 16vw);
  border-radius: 1rem;
  box-shadow: inset 0 0 0 1px hsla(215.7, 76.4%, 21.6%, 0.15);
}

footer {
  z-index: 2;
  padding: 2rem;
  // Lift clear of the viewport edge so the guess input's suggestion list
  // (which opens downward) isn't clipped off the bottom of the screen.
  // Scales with viewport height so it never steals too much room on short
  // screens, but always reserves enough on tall ones.
  padding-bottom: clamp(8rem, 24vh, 20rem);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;
}
</style>
