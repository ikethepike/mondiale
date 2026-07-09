<template>
  <div v-if="challenge" class="capital-guess">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Capital Guess`"
      title="What capital is this?"
      stakes="Name the country from its capital's skyline before the clock runs out. First correct guess wins the points."
      @done="start"
    />

    <header>
      <div class="prompt">
        <h1 class="map-caption">Which country's capital is this?</h1>
        <span class="map-caption sub">{{ secondsLeft }}s left</span>
        <Transition name="caption">
          <span v-if="hint" class="map-caption hint">{{ hint }}</span>
        </Transition>
      </div>
    </header>

    <section class="stage">
      <!-- Adaptive photo stage — any aspect ratio, never cropped; zoom + pan. -->
      <div class="photo-stage">
        <ZoomableImage :src="challenge.image" alt="A capital city" />
      </div>

      <GuessTicker :entries="entries" :players="gameStore.game?.players ?? {}" />
    </section>

    <!-- The free-type input opens a suggestion list downward, so that variant
         reserves extra room below; the flag-options grid needs none. -->
    <footer :class="{ 'has-input': !challenge.options }">
      <div class="timer-track" aria-hidden="true">
        <div
          class="timer-fill"
          :style="{ width: `${(secondsLeft / challenge.durationSeconds) * 100}%` }"
        />
      </div>

      <!-- Non-hard mode: pick from four flag options. Hard mode: free-type. -->
      <div v-if="challenge.options" class="options card-options">
        <button
          v-for="option in challenge.options"
          :key="option"
          class="option card-option"
          type="button"
          :disabled="submitted || !started"
          @click="onGuess(getCountry(option))"
        >
          <CountryTileFlag class="option-flag" :country="getCountry(option)" />
          <span>{{ countryName(option) }}</span>
        </button>
      </div>
      <CountryGuessInput
        v-else
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
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import ZoomableImage from '~/components/challenge/ZoomableImage.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
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
} = useGroupChallenge('capital-guess-challenge')

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

const submitRound = (correct: boolean) => {
  if (submitted.value) return
  gameStore.map.status = correct ? 'correct' : undefined
  submitOnce(
    correct && challenge.value ? [challenge.value.country] : [],
    correct ? (challenge.value?.maximumPoints ?? 0) : 0
  )
}

const start = () => {
  begin({ onTimeout: () => submitRound(false) })
  nextTick(() => guessInput.value?.focus())
}

const onGuess = (country: Country) => {
  const active = challenge.value
  if (!active || submitted.value || !started.value) return
  // The winning guess is never broadcast — it would hand opponents the answer.
  // Outside hard mode the four options make even a wrong name too strong a
  // clue, so the policy drops that variant to presence.
  if (country.isoCode === active.country) submitRound(true)
  else
    announce({
      kind: 'wrong',
      isoCode: country.isoCode,
      hint: `${countryName(country)} — not it`,
    })
}
</script>
<style lang="scss" scoped>
.capital-guess {
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
  gap: 1.6rem;
}

// The photo is the hero of this round, so it can breathe more than the gate's
// stage. Scales fluidly with the viewport between a floor and a larger ceiling.
.photo-stage {
  width: clamp(30rem, 70vw, 54rem);
  height: clamp(22rem, 40vh, 38rem);
}

@media (max-width: 640px) {
  .photo-stage {
    width: min(94vw, 54rem);
    height: min(42vh, 38rem);
  }
}

footer {
  z-index: 2;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;

  // Free-type variant: lift clear of the viewport edge so the guess input's
  // suggestion list (which opens downward) isn't clipped off the bottom. Scales
  // with viewport height so it never steals too much room on short screens.
  &.has-input {
    padding-bottom: clamp(8rem, 24vh, 20rem);
  }
}

.timer-track {
  width: 100%;
  max-width: 46rem;
  height: 0.5rem;
  border-radius: 0.25rem;
  background: hsla(215.7, 76.4%, 21.6%, 0.12);
  overflow: hidden;
}
.timer-fill {
  height: 100%;
  background: var(--soft-blue);
  transition: width 1s linear;
}

.card-options {
  gap: 1.4rem;
  display: grid;
  pointer-events: auto;
  grid-template-columns: repeat(2, minmax(14rem, 20rem));
}
.card-option {
  cursor: pointer;
  padding: 1rem;
  gap: 0.8rem;
  display: flex;
  align-items: center;
  flex-flow: column nowrap;
  border-radius: 1.2rem;
  color: var(--dark-blue);
  backdrop-filter: blur(0.5rem);
  background: hsla(36, 100%, 98%, 0.88);
  border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
  transition:
    transform var(--motion-quick) var(--ease-out-expressive),
    border-color var(--motion-quick) var(--ease-out-expressive);

  &:hover:not(:disabled) {
    transform: translateY(-0.3rem);
    border-color: var(--dark-blue);
  }
  &:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .option-flag {
    width: 100%;
    height: 6rem;
    border: 0.1rem solid hsla(215.7, 76.4%, 21.6%, 0.25);
  }
}
@media (max-width: 640px) {
  .card-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
