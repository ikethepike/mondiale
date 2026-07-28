<template>
  <div v-if="challenge" class="capital-guess challenge-shell">
    <Interstitial
      v-if="showInterstitial"
      tone="info"
      :kicker="`Round ${currentRound?.number ?? 1} — Capital Guess`"
      title="What capital is this?"
      :stakes="stakes"
      @done="start"
    />

    <ChallengePrompt :hint="hint">
      <h1 class="map-caption">Which country's capital is this?</h1>
    </ChallengePrompt>

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
      <!-- Non-hard mode: pick from flag options, the round clock above them.
           Hard mode: the clock lives inside the guess console. -->
      <template v-if="challenge.options">
        <ChallengeTimerRadial
          class="footer-clock"
          :value="secondsLeft"
          :total="challenge.durationSeconds"
        />
        <div class="options card-options">
          <button
            v-for="option in challenge.options"
            :key="option"
            class="option card-option"
            :class="{ 'is-spent': spent.includes(option) }"
            type="button"
            :disabled="submitted || !started || spent.includes(option)"
            @click="onGuess(getCountry(option))"
          >
            <CountryTileFlag class="option-flag" :country="getCountry(option)" />
            <span>{{ countryName(option) }}</span>
          </button>
        </div>
      </template>
      <ChallengeConsole v-else class="console" :value="secondsLeft" :total="challenge.durationSeconds">
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
import CountryGuessInput from '~/components/country/CountryGuessInput.vue'
import ChallengeConsole from '~/components/challenge/ChallengeConsole.vue'
import ChallengePrompt from '~/components/challenge/ChallengePrompt.vue'
import ChallengeTimerRadial from '~/components/challenge/ChallengeTimerRadial.vue'
import ZoomableImage from '~/components/challenge/ZoomableImage.vue'
import GuessTicker from '~/components/feedback/GuessTicker.vue'
import Interstitial from '~/components/feedback/Interstitial.vue'
import { countryName, getCountry } from '~~/lib/country'
import { useGroupChallenge } from '~~/lib/useGroupChallenge'
import { useAttemptOptions } from '~~/lib/use-attempt-options'

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
  announce,
  entries,
  submitOnce,
  gameStore,
} = useGroupChallenge('capital-guess-challenge')

const guessInput = ref<InstanceType<typeof CountryGuessInput>>()

const stakes = computed(() =>
  challenge.value?.maximumGuesses
    ? `Name the country from its capital's skyline. You get ${challenge.value.maximumGuesses} guesses — each one you spend is worth less.`
    : "Name the country from its capital's skyline before the clock runs out. The sooner you name it, the more it's worth."
)


const submitRound = (score: number) => {
  if (submitted.value) return
  gameStore.map.status = score > 0 ? 'correct' : undefined
  submitOnce(score > 0 && challenge.value ? [challenge.value.country] : [], score)
}

const start = () => {
  begin({ onTimeout: () => submitRound(0) })
  nextTick(() => guessInput.value?.focus())
}

// The winning guess is never broadcast — outside hard mode the small option
// table makes even a wrong name too strong a clue (policy drops to presence).
const { spent, onGuess } = useAttemptOptions({
  challenge,
  submitted,
  started,
  remainingFraction,
  announce,
  submitRound,
})
</script>
<style lang="scss" scoped>
@use '~/assets/scss/rules/breakpoints' as *;

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

@media (max-width: $tablet) {
  // The photo absorbs whatever the prompt and the option grid leave over —
  // fewer options mean a taller hero, more options shrink it — instead of
  // the fixed height leaving a band of dead space above the footer.
  .stage {
    flex: 1 1 auto;
    min-height: 0;
    justify-content: center;
  }
  .photo-stage {
    width: min(94vw, 54rem);
    flex: 1 1 auto;
    height: auto;
    min-height: 14rem;
    max-height: min(44dvh, 38rem);
  }
}

// The options variant's round clock, centred above the flag grid.
.footer-clock {
  --clock-size: 5.6rem;
  --clock-seconds-size: 1.8rem;
}

footer {
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

.card-options {
  grid-template-columns: repeat(2, minmax(14rem, 20rem));
}
@media (max-width: $tablet) {
  .card-options {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  footer.has-input {
    padding-bottom: clamp(8rem, 24dvh, 20rem);
  }
}
</style>
